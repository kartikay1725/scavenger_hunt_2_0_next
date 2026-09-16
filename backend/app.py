from __future__ import annotations

import hashlib
import hmac
import io
import json
import os
import random
import secrets
import zipfile
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from bson import ObjectId
from flask import Flask, jsonify, make_response, render_template, request, send_file
from flask_cors import CORS
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument, UpdateOne
import qrcode

BACKEND_DIR = Path(__file__).resolve().parent

# Load local .env if present
env_path = BACKEND_DIR / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["JSON_SORT_KEYS"] = False

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "")
CORS(app, supports_credentials=True, origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN else "*")

MONGO_URI = os.getenv("MONGODB_URI", "")
DB_NAME = os.getenv("MONGODB_DB", "scavenger_hunt_2_0")
SECRET = os.getenv("APP_SECRET", "change-me-in-production-scavenger-hunt-2026")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")
GAME_NAME = os.getenv("GAME_NAME", "Scavenger Hunt 2.0 — CodeChef")

serializer = URLSafeTimedSerializer(SECRET, salt="scavenger-admin")
ca_file = None
try:
    import certifi
    ca_file = certifi.where()
except Exception:
    pass

try:
    import dns.resolver
    dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
    dns.resolver.default_resolver.nameservers = ['8.8.8.8', '1.1.1.1']
except Exception:
    pass

client = (
    MongoClient(MONGO_URI, tlsCAFile=ca_file, maxPoolSize=300, minPoolSize=10)
    if (MONGO_URI and ca_file)
    else (MongoClient(MONGO_URI, maxPoolSize=300, minPoolSize=10) if MONGO_URI else None)
)
db = client[DB_NAME] if client is not None else None
_db_initialized = False


LOCATIONS = [
    {"code": "LOC-01", "name": "Auditorium"},
    {"code": "LOC-02", "name": "Mountain Dew Ground"},
    {"code": "LOC-03", "name": "Fourteen"},
    {"code": "LOC-04", "name": "Stationary"},
    {"code": "LOC-05", "name": "Gym"},
    {"code": "LOC-06", "name": "Green Circle — IMR Wala Garden"},
    {"code": "LOC-07", "name": "Guard Main Gate"},
    {"code": "LOC-08", "name": "Saraswati Mata Murti — A Block"},
    {"code": "LOC-09", "name": "Book Bank"},
    {"code": "LOC-10", "name": "F Block Hawamahal"},
]
LOCATION_MAP = {x["code"]: x["name"] for x in LOCATIONS}


def now_ist() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Any) -> str | None:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone(timedelta(hours=5, minutes=30))).isoformat()
    return str(dt)


def ensure_db() -> None:
    global _db_initialized
    if db is None or _db_initialized:
        return
    try:
        db.teams.create_index("team_code", unique=True)
        db.players.create_index([("team_id", ASCENDING), ("created_at", ASCENDING)])
        db.checkpoints.create_index("qr_token", unique=True)
        db.checkpoints.create_index("location_code", unique=True)
        db.puzzles.create_index([("location_code", ASCENDING), ("puzzle_key", ASCENDING)], unique=True)
        db.assignments.create_index([("team_id", ASCENDING), ("location_code", ASCENDING)], unique=True)
        db.scans.create_index([("team_id", ASCENDING), ("timestamp", DESCENDING)])
        db.sessions.create_index("token_hash", unique=True)

        if db.game_state.find_one({"_id": "global"}) is None:
            db.game_state.insert_one({
                "_id": "global",
                "status": "SETUP",
                "start_at": None,
                "duration_seconds": 3600,
                "token_buffer_seconds": 20,
                "session_limit_minutes": 180,
                "checkpoint_count": 10,
                "starting_room": "Seminar Hall 2",
                "results_published": False,
                "updated_at": now_ist(),
            })

        for loc in LOCATIONS:
            existing = db.checkpoints.find_one({"location_code": loc["code"]})
            if not existing:
                db.checkpoints.insert_one({
                    "location_code": loc["code"],
                    "location_name": loc["name"],
                    "qr_token": f"SHT2_{secrets.token_urlsafe(20)}",
                    "created_at": now_ist(),
                })
        _db_initialized = True
    except Exception as e:
        app.logger.warning(f"ensure_db notice: {e}")



def password_ok(password: str) -> bool:
    fallback = os.getenv("ADMIN_PASSWORD", "codechef@2026")
    if fallback and hmac.compare_digest(fallback, password):
        return True
    if ADMIN_PASSWORD_HASH:
        from werkzeug.security import check_password_hash
        try:
            if check_password_hash(ADMIN_PASSWORD_HASH, password):
                return True
        except Exception:
            pass
    return False


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        raw = request.cookies.get("admin_session")
        if not raw:
            return jsonify({"ok": False, "error": "Admin authentication required"}), 401
        try:
            data = serializer.loads(raw, max_age=60 * 60 * 24 * 7)
            if data.get("u") != ADMIN_USERNAME:
                raise BadSignature("bad user")
        except BadSignature:
            return jsonify({"ok": False, "error": "Invalid admin session"}), 401
        return fn(*args, **kwargs)
    return wrapper


def public_game_state() -> dict[str, Any]:
    s = db.game_state.find_one({"_id": "global"}) if db is not None else None
    if not s:
        s = {"status": "SETUP", "results_published": False, "duration_seconds": 3600, "starting_room": "Seminar Hall 2"}
    state = dict(s)
    state.pop("_id", None)
    if state.get("start_at"):
        raw_start = s["start_at"]
        if isinstance(raw_start, str):
            try:
                raw_start = datetime.fromisoformat(raw_start.replace("Z", "+00:00"))
            except Exception:
                raw_start = None
        if raw_start:
            if raw_start.tzinfo is None:
                raw_start = raw_start.replace(tzinfo=timezone.utc)
            state["start_at"] = iso(raw_start)
            end = raw_start + timedelta(seconds=int(s.get("duration_seconds", 3600)))
            state["end_at"] = iso(end)
    state["remaining_seconds"] = remaining_seconds(state)
    state["server_time"] = iso(now_ist())
    return state


def team_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


def session_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_player() -> dict[str, Any] | None:
    token = request.cookies.get("player_session")
    if not token or db is None:
        return None
    p = db.sessions.find_one({"token_hash": token_hash(token), "expires_at": {"$gt": now_ist()}})
    if not p:
        return None
    return db.players.find_one({"_id": p["player_id"]})


def team_for_player(player: dict[str, Any]) -> dict[str, Any] | None:
    return db.teams.find_one({"_id": player["team_id"]}) if db is not None else None


def normalize_answer(x: str) -> str:
    return " ".join((x or "").strip().lower().replace("-", " ").replace("_", " ").split())


def select_unique_puzzle(team_id: ObjectId, target_location_code: str) -> dict[str, Any]:
    # Ensure no two teams receive the same question for this target location.
    assigned_keys = {x["puzzle_key"] for x in db.assignments.find({"target_next_code": target_location_code}, {"puzzle_key": 1})}
    candidates = list(db.puzzles.find({"location_code": target_location_code, "puzzle_key": {"$nin": list(assigned_keys)}}))
    if candidates:
        return secrets.choice(candidates)

    # Fallback to any puzzle for this target location if all uniquely exhausted
    all_candidates = list(db.puzzles.find({"location_code": target_location_code}))
    if all_candidates:
        return secrets.choice(all_candidates)

    # Deterministic fallback generator if database had 0 puzzles for this location
    seed_text = hashlib.sha256(f"{team_id}:{target_location_code}:{secrets.token_hex(8)}".encode()).hexdigest()
    seed = int(seed_text[:12], 16)
    return generate_variant_puzzle(target_location_code, seed)


def generate_finish_puzzle(starting_room: str, seed: int) -> dict[str, Any]:
    clue = f"FINISH AT {starting_room.upper()}".strip()
    answer = starting_room
    shift = seed % 19 + 5
    mask = seed % 13 + 2
    n = len(clue)
    order = list(range(n))
    state = seed % 2147483647 or 1
    for i in range(n - 1, 0, -1):
        state = (state * 48271) % 2147483647
        j = state % (i + 1)
        order[i], order[j] = order[j], order[i]
    encoded = [((ord(ch) + shift + mask) % 256) for ch in clue]
    scrambled = [encoded[i] for i in order]
    language = "Python" if seed % 2 == 0 else "C++"

    if language == "Python":
        code = "\n".join([
            "# Scavenger Hunt 2.0 — Final Victory Checkpoint Challenge",
            "# Decode the program output to find where the hunt officially concludes.",
            f"DATA = {scrambled!r}",
            f"ORDER = {order!r}",
            f"SHIFT = {shift}",
            f"MASK = {mask}",
            "NOISE = [3, 1, 4, 1, 5, 9, 2, 6]",
            "",
            "def fold(values):",
            "    result = []",
            "    for index, value in enumerate(values):",
            "        noise = NOISE[index % len(NOISE)]",
            "        result.append((value + noise) % 256)",
            "    return result",
            "",
            "def unshuffle(values, positions):",
            "    restored = [0] * len(values)",
            "    for scrambled_index, original_index in enumerate(positions):",
            "        restored[original_index] = values[scrambled_index]",
            "    return restored",
            "",
            "def decode(values):",
            "    chars = []",
            "    for value in values:",
            "        value = (value - MASK) % 256",
            "        value = (value - SHIFT) % 256",
            "        chars.append(chr(value))",
            "    return ''.join(chars)",
            "",
            "shadow = fold(DATA)",
            "shadow = [(x - NOISE[i % len(NOISE)]) % 256 for i, x in enumerate(shadow)]",
            "restored = unshuffle(shadow, ORDER)",
            "answer = decode(restored)",
            "print(answer)",
        ])
    else:
        data = ", ".join(map(str, scrambled))
        ords = ", ".join(map(str, order))
        code = "\n".join([
            "// Scavenger Hunt 2.0 — Final Victory Checkpoint Challenge",
            "#include <iostream>",
            "#include <vector>",
            "#include <string>",
            "using namespace std;",
            "",
            f"vector<int> DATA = {{{data}}};",
            f"vector<int> ORDER = {{{ords}}};",
            f"int SHIFT = {shift};",
            f"int MASK = {mask};",
            "int main() {",
            "    vector<int> restored(DATA.size(), 0);",
            "    for (size_t i = 0; i < DATA.size(); ++i) restored[ORDER[i]] = DATA[i];",
            "    string answer;",
            "    for (int x : restored) answer.push_back(static_cast<char>((x - MASK - SHIFT + 512) % 256));",
            "    cout << answer << endl;",
            "    return 0;",
            "}",
        ])

    accepted = list({
        normalize_answer(clue),
        normalize_answer(answer),
        normalize_answer("seminar hall 2"),
        normalize_answer("seminar hall"),
        normalize_answer("seminarhall2"),
        normalize_answer("seminarhall 2"),
    })

    return {
        "puzzle_key": f"GEN-FINISH-{seed:012x}",
        "location_code": "FINISH",
        "language": language,
        "title": "Final Checkpoint — Victory Code Challenge",
        "code": code,
        "answer": starting_room,
        "accepted_answers": accepted,
        "hint1": "All 10 physical checkpoints cleared! The code reveals where the hunt concludes.",
        "hint2": f"Return to {starting_room} to register your final time.",
        "difficulty": "Hard",
        "generated": True,
        "created_at": now_ist(),
        "location_name": starting_room,
    }


def generate_variant_puzzle(location_code: str, seed: int) -> dict[str, Any]:
    clue_map = {
        "LOC-01": ("STAGE MIC SHOW", "Auditorium"),
        "LOC-02": ("GREEN BOTTLE + MOUNTAIN", "Mountain Dew Ground"),
        "LOC-03": ("7 + 7", "Fourteen"),
        "LOC-04": ("PEN + PAPER", "Stationary"),
        "LOC-05": ("IRON + REPS", "Gym"),
        "LOC-06": ("GREEN + CIRCLE + GARDEN", "Green Circle — IMR Wala Garden"),
        "LOC-07": ("SECURITY + MAIN + GATE", "Guard Main Gate"),
        "LOC-08": ("KNOWLEDGE + GODDESS + STATUE", "Saraswati Mata Murti — A Block"),
        "LOC-09": ("BOOK + MONEY", "Book Bank"),
        "LOC-10": ("F BLOCK + AIR", "F Block Hawamahal"),
    }
    clue, answer = clue_map.get(location_code, ("CAMPUS LOCATION", "Target"))
    shift = seed % 19 + 5
    mask = seed % 13 + 2
    n = len(clue)
    order = list(range(n))
    state = seed % 2147483647 or 1
    for i in range(n - 1, 0, -1):
        state = (state * 48271) % 2147483647
        j = state % (i + 1)
        order[i], order[j] = order[j], order[i]
    encoded = [((ord(ch) + shift + mask) % 256) for ch in clue]
    scrambled = [encoded[i] for i in order]
    language = "Python" if seed % 2 == 0 else "C++"

    if language == "Python":
        code = "\n".join([
            "# Scavenger Hunt 2.0 — CodeChef team variant",
            "# The final output is an indirect campus clue.",
            f"DATA = {scrambled!r}",
            f"ORDER = {order!r}",
            f"SHIFT = {shift}",
            f"MASK = {mask}",
            "NOISE = [3, 1, 4, 1, 5, 9, 2, 6]",
            "",
            "def fold(values):",
            "    result = []",
            "    for index, value in enumerate(values):",
            "        noise = NOISE[index % len(NOISE)]",
            "        result.append((value + noise) % 256)",
            "    return result",
            "",
            "def unshuffle(values, positions):",
            "    restored = [0] * len(values)",
            "    for scrambled_index, original_index in enumerate(positions):",
            "        restored[original_index] = values[scrambled_index]",
            "    return restored",
            "",
            "def decode(values):",
            "    chars = []",
            "    for value in values:",
            "        value = (value - MASK) % 256",
            "        value = (value - SHIFT) % 256",
            "        chars.append(chr(value))",
            "    return ''.join(chars)",
            "",
            "shadow = fold(DATA)",
            "shadow = [(x - NOISE[i % len(NOISE)]) % 256 for i, x in enumerate(shadow)]",
            "restored = unshuffle(shadow, ORDER)",
            "answer = decode(restored)",
            "print(answer)",
        ])
    else:
        data = ", ".join(map(str, scrambled))
        ords = ", ".join(map(str, order))
        code = "\n".join([
            "// Scavenger Hunt 2.0 — CodeChef team variant",
            "#include <iostream>",
            "#include <vector>",
            "#include <string>",
            "using namespace std;",
            "",
            f"vector<int> DATA = {{{data}}};",
            f"vector<int> ORDER = {{{ords}}};",
            f"int SHIFT = {shift};",
            f"int MASK = {mask};",
            "int main() {",
            "    vector<int> restored(DATA.size(), 0);",
            "    for (size_t i = 0; i < DATA.size(); ++i) restored[ORDER[i]] = DATA[i];",
            "    string answer;",
            "    for (int x : restored) answer.push_back(static_cast<char>((x - MASK - SHIFT + 512) % 256));",
            "    cout << answer << endl;",
            "    return 0;",
            "}",
        ])

    return {
        "puzzle_key": f"GEN-{location_code}-{seed:012x}",
        "location_code": location_code,
        "language": language,
        "title": f"{LOCATION_MAP.get(location_code, location_code)} Trail Challenge",
        "code": code,
        "answer": clue,
        "accepted_answers": [normalize_answer(clue), normalize_answer(answer)],
        "hint1": "Trace or execute the program. The final output is an indirect clue.",
        "hint2": "Interpret the words printed at runtime using your campus map.",
        "difficulty": "Hard",
        "generated": True,
        "created_at": now_ist(),
        "location_name": LOCATION_MAP.get(location_code, location_code),
    }


def generate_canonical_assignment(team: dict[str, Any], location_code: str) -> dict[str, Any]:
    existing = db.assignments.find_one({"team_id": team["_id"], "location_code": location_code})
    if existing and existing.get("target_next_code"):
        return existing

    route = team.get("route", [])
    if location_code in route:
        idx = route.index(location_code)
        total = len(route)
    else:
        idx = 0
        total = max(1, len(route))

    # If this is not the final checkpoint, assign puzzle pointing to the NEXT checkpoint in the route!
    if idx < total - 1 and len(route) > idx + 1:
        target_next_code = route[idx + 1]
        puzzle = select_unique_puzzle(team["_id"], target_next_code)
        target_next_name = LOCATION_MAP.get(target_next_code, target_next_code)
        step_num = idx + 1
        title = f"Checkpoint {step_num} Cleared — Trail Challenge"
        hint1 = puzzle.get("hint1") or "Trace or execute the code carefully to reveal your next destination."
        hint2 = puzzle.get("hint2") or f"Interpret the decoded words to locate Checkpoint {step_num + 1}."
        extra_aliases = ["guard wale uncle", "guardwaleuncle", "guard main gate", "guardmaingate"] if target_next_code == "LOC-07" else []
        accepted = list({
            normalize_answer(puzzle.get("answer") or puzzle.get("expected_output") or ""),
            normalize_answer(target_next_name),
            normalize_answer(target_next_code),
            *[normalize_answer(x) for x in puzzle.get("accepted_answers", [])],
            *[normalize_answer(x) for x in extra_aliases],
        })
    else:
        # Final checkpoint (10th) -> Assign final victory challenge leading back to starting room!
        target_next_code = "FINISH"
        s = db.game_state.find_one({"_id": "global"}) or {} if db is not None else {}
        starting_room = s.get("starting_room", "Seminar Hall 2")
        seed_text = hashlib.sha256(f"{team['_id']}:FINISH:{secrets.token_hex(8)}".encode()).hexdigest()
        seed = int(seed_text[:12], 16)
        puzzle = generate_finish_puzzle(starting_room, seed)
        title = f"Checkpoint {total} Cleared — Final Victory Challenge"
        hint1 = "All physical checkpoints cleared! Decode the code to find where the hunt officially concludes."
        hint2 = f"Return to {starting_room} to register your team's final time."
        accepted = puzzle.get("accepted_answers", [
            normalize_answer(starting_room),
            normalize_answer("seminar hall 2"),
            normalize_answer("seminar hall"),
        ])

    assignment = {
        "team_id": team["_id"],
        "location_code": location_code,
        "target_next_code": target_next_code,
        "puzzle_key": puzzle["puzzle_key"],
        "assigned_at": now_ist(),
        "puzzle_snapshot": {
            "title": title,
            "language": puzzle.get("language", "Python"),
            "code": puzzle.get("code", ""),
            "hint1": hint1,
            "hint2": hint2,
            "difficulty": puzzle.get("difficulty", "Medium"),
            "accepted_answers": accepted,
        },
    }
    db.assignments.update_one(
        {"team_id": team["_id"], "location_code": location_code},
        {"$set": assignment},
        upsert=True,
    )
    return db.assignments.find_one({"team_id": team["_id"], "location_code": location_code})


def initialize_routes_and_assignments() -> None:
    """
    Authoritative Rule 2 & 17:
    Generate and freeze a complete randomized route containing all 10 locations exactly once
    separately for every team. Pre-assign unique puzzles per team/location and freeze them.
    Optimized to run in O(1) bulk MongoDB operations instead of N*10 individual round trips.
    """
    teams = list(db.teams.find({"status": {"$ne": "DISQUALIFIED"}}))
    if not teams:
        return

    all_codes = [x["code"] for x in LOCATIONS]
    existing_routes = [tuple(t.get("route", [])) for t in teams if t.get("route")]

    gs = db.game_state.find_one({"_id": "global"}) if db is not None else None
    game_status = "LIVE" if (gs and gs.get("status") == "LIVE") else "READY"
    starting_room = (gs or {}).get("starting_room", "Seminar Hall 2")

    # Load all puzzles into memory by location for fast, unique assignment
    all_puzzles = list(db.puzzles.find())
    puzzles_by_loc: dict[str, list[dict[str, Any]]] = {}
    for p in all_puzzles:
        puzzles_by_loc.setdefault(p.get("location_code", ""), []).append(p)

    # Track puzzle keys already assigned
    existing_assignments = list(db.assignments.find({}, {"team_id": 1, "location_code": 1, "target_next_code": 1, "puzzle_key": 1}))
    assigned_keys_by_loc: dict[str, set[str]] = {}
    assigned_team_locs: set[tuple[Any, str]] = set()
    for a in existing_assignments:
        loc = a.get("target_next_code")
        pkey = a.get("puzzle_key")
        if loc and pkey:
            assigned_keys_by_loc.setdefault(loc, set()).add(pkey)
        if a.get("team_id") and a.get("location_code"):
            assigned_team_locs.add((a["team_id"], a["location_code"]))

    team_ops: list[UpdateOne] = []
    assignment_ops: list[UpdateOne] = []

    for team in teams:
        if team.get("game_initialized") and team.get("route") and len(team.get("route")) == 10:
            if gs and gs.get("status") == "LIVE" and team.get("status") == "READY":
                team_ops.append(UpdateOne({"_id": team["_id"]}, {"$set": {"status": "LIVE"}}))
            continue

        # Deterministically generate a unique permutation
        shuffled = list(all_codes)
        for _ in range(20):
            random.shuffle(shuffled)
            if tuple(shuffled) not in existing_routes or len(teams) > 3628800:
                break
        existing_routes.append(tuple(shuffled))

        first_target = shuffled[0]
        team_ops.append(UpdateOne({"_id": team["_id"]}, {"$set": {
            "route": shuffled,
            "current_step": 0,
            "score": 0,
            "completed_locations": [],
            "remaining_locations": shuffled,
            "target_location_code": first_target,
            "target_assigned_at": now_ist(),
            "status": game_status,
            "game_initialized": True,
            "hints_used": 0,
        }}))

        # Pre-generate and freeze unique puzzle assignments for all 10 checkpoints
        total = len(shuffled)
        for idx, loc_code in enumerate(shuffled):
            if (team["_id"], loc_code) in assigned_team_locs:
                continue

            if idx < total - 1 and len(shuffled) > idx + 1:
                target_next_code = shuffled[idx + 1]
                used_keys = assigned_keys_by_loc.setdefault(target_next_code, set())
                candidates = [p for p in puzzles_by_loc.get(target_next_code, []) if p.get("puzzle_key") not in used_keys]
                if candidates:
                    puzzle = secrets.choice(candidates)
                    used_keys.add(puzzle["puzzle_key"])
                elif puzzles_by_loc.get(target_next_code):
                    puzzle = secrets.choice(puzzles_by_loc[target_next_code])
                else:
                    seed_text = hashlib.sha256(f"{team['_id']}:{target_next_code}:{secrets.token_hex(8)}".encode()).hexdigest()
                    seed = int(seed_text[:12], 16)
                    puzzle = generate_variant_puzzle(target_next_code, seed)

                target_next_name = LOCATION_MAP.get(target_next_code, target_next_code)
                step_num = idx + 1
                title = f"Checkpoint {step_num} Cleared — Trail Challenge"
                hint1 = puzzle.get("hint1") or "Trace or execute the code carefully to reveal your next destination."
                hint2 = puzzle.get("hint2") or f"Interpret the decoded words to locate Checkpoint {step_num + 1}."
                extra_aliases = ["guard wale uncle", "guardwaleuncle", "guard main gate", "guardmaingate"] if target_next_code == "LOC-07" else []
                accepted = list({
                    normalize_answer(puzzle.get("answer") or puzzle.get("expected_output") or ""),
                    normalize_answer(target_next_name),
                    normalize_answer(target_next_code),
                    *[normalize_answer(x) for x in puzzle.get("accepted_answers", [])],
                    *[normalize_answer(x) for x in extra_aliases],
                })
            else:
                target_next_code = "FINISH"
                seed_text = hashlib.sha256(f"{team['_id']}:FINISH:{secrets.token_hex(8)}".encode()).hexdigest()
                seed = int(seed_text[:12], 16)
                puzzle = generate_finish_puzzle(starting_room, seed)
                title = f"Checkpoint {total} Cleared — Final Victory Challenge"
                hint1 = "All physical checkpoints cleared! Decode the code to find where the hunt officially concludes."
                hint2 = f"Return to {starting_room} to register your team's final time."
                accepted = puzzle.get("accepted_answers", [
                    normalize_answer(starting_room),
                    normalize_answer("seminar hall 2"),
                    normalize_answer("seminar hall"),
                ])

            assignment = {
                "team_id": team["_id"],
                "location_code": loc_code,
                "target_next_code": target_next_code,
                "puzzle_key": puzzle["puzzle_key"],
                "assigned_at": now_ist(),
                "puzzle_snapshot": {
                    "title": title,
                    "language": puzzle.get("language", "Python"),
                    "code": puzzle.get("code", ""),
                    "hint1": hint1,
                    "hint2": hint2,
                    "difficulty": puzzle.get("difficulty", "Medium"),
                    "accepted_answers": accepted,
                },
            }
            assignment_ops.append(UpdateOne(
                {"team_id": team["_id"], "location_code": loc_code},
                {"$set": assignment},
                upsert=True,
            ))
            assigned_team_locs.add((team["_id"], loc_code))

    if team_ops:
        db.teams.bulk_write(team_ops, ordered=False)
    if assignment_ops:
        db.assignments.bulk_write(assignment_ops, ordered=False)


def remaining_seconds(state: dict[str, Any]) -> int:
    status = state.get("status")
    if status == "ENDED":
        return 0
    if status == "PAUSED" and state.get("paused_remaining_seconds") is not None:
        return max(0, int(state["paused_remaining_seconds"]))
    if not state.get("start_at") or status in {"SETUP", "READY"}:
        return int(state.get("duration_seconds", 3600))
    start = state["start_at"]
    try:
        if isinstance(start, str):
            start = datetime.fromisoformat(start.replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        end = start + timedelta(seconds=int(state.get("duration_seconds", 3600)))
        return max(0, int((end - now_ist()).total_seconds()))
    except Exception:
        return int(state.get("duration_seconds", 3600))


def maybe_auto_start_game() -> None:
    if db is None:
        return
    s = db.game_state.find_one({"_id": "global"})
    if not s or s.get("status") not in {"SETUP", "READY"} or not s.get("start_at"):
        return
    now = now_ist()
    start = s["start_at"]
    if isinstance(start, str):
        try:
            start = datetime.fromisoformat(start.replace("Z", "+00:00"))
        except Exception:
            return
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if now < start:
        return
    initialize_routes_and_assignments()
    db.game_state.update_one(
        {"_id": "global", "status": {"$in": ["SETUP", "READY"]}, "start_at": {"$lte": now}},
        {"$set": {"status": "LIVE", "updated_at": now}}
    )
    db.teams.update_many({"status": "READY"}, {"$set": {"status": "LIVE"}})


def maybe_auto_end_game() -> None:
    if db is None:
        return
    maybe_auto_start_game()
    s = db.game_state.find_one({"_id": "global"})
    if s and s.get("status") == "LIVE" and remaining_seconds(s) <= 0:
        db.game_state.update_one(
            {"_id": "global", "status": "LIVE"},
            {"$set": {"status": "ENDED", "updated_at": now_ist()}}
        )


# ==============================================================================
# HTTP ROUTES
# ==============================================================================

@app.get("/")
def home():
    return render_template("index.html", game_name=GAME_NAME)


@app.get("/admin/login")
def admin_login_page():
    return render_template("admin_login.html", game_name=GAME_NAME)


@app.get("/admin")
def admin_page():
    return render_template("admin.html", game_name=GAME_NAME)


@app.post("/api/admin/login")
def admin_login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", "")).strip()

    if not hmac.compare_digest(username, ADMIN_USERNAME) or not password_ok(password):
        return jsonify({"ok": False, "error": "Invalid username or password"}), 401

    token = serializer.dumps({"u": ADMIN_USERNAME})
    response = make_response(jsonify({"ok": True}))
    response.set_cookie("admin_session", token, httponly=True, secure=bool(request.is_secure), samesite="Lax", path="/", max_age=7 * 86400)
    return response


@app.post("/api/admin/logout")
@admin_required
def admin_logout():
    response = make_response(jsonify({"ok": True}))
    response.delete_cookie("admin_session", path="/")
    return response


@app.get("/api/game")
def game_state():
    maybe_auto_end_game()
    state = public_game_state()
    return jsonify({"ok": True, "game": state, "locations": LOCATIONS})


@app.get("/api/results")
def results():
    """
    Authoritative Rule 19:
    - Exclude disqualified teams.
    - Full finishers (completed all 10) ranked by lowest final_result_seconds.
    - If no team finished all 10: rank by highest score, then lowest time.
    - Public once results_published == true.
    """
    maybe_auto_end_game()
    if db is None:
        return jsonify({"ok": False, "error": "Database is not configured"}), 503

    s = db.game_state.find_one({"_id": "global"})
    if not s or not s.get("results_published"):
        return jsonify({"ok": True, "published": False, "results": []})

    all_teams = list(db.teams.find())

    finishers = []
    incomplete = []
    disqualified = []

    for t in all_teams:
        completed_count = len(t.get("completed_locations", []))
        item = {
            "id": str(t["_id"]),
            "team": t.get("team_name", "Unknown"),
            "score": int(t.get("score", 0)),
            "completed": completed_count,
            "status": t.get("status", "READY"),
            "game_elapsed_seconds": t.get("game_elapsed_seconds"),
            "entry_differential_seconds": t.get("entry_differential_seconds"),
            "result_token_seconds": t.get("result_token_seconds"),
            "final_result_seconds": t.get("final_result_seconds"),
            "finish_time": iso(t.get("finish_at")),
            "disqualification_reason": t.get("disqualification_reason"),
        }
        if t.get("status") == "DISQUALIFIED":
            disqualified.append(item)
        elif completed_count >= 10 or t.get("status") == "FINISHED":
            finishers.append(item)
        else:
            incomplete.append(item)

    # Sort finishers by final_result_seconds ASC
    finishers.sort(key=lambda x: (x["final_result_seconds"] if x["final_result_seconds"] is not None else float("inf"), -x["score"]))

    # Sort incomplete by score DESC, then final_result_seconds / elapsed ASC
    incomplete.sort(key=lambda x: (-x["score"], x["final_result_seconds"] if x["final_result_seconds"] is not None else float("inf")))

    # Sort disqualified by score DESC, then time
    disqualified.sort(key=lambda x: (-x["score"], x["final_result_seconds"] if x["final_result_seconds"] is not None else float("inf")))

    ordered = []
    rank = 1
    for row in (finishers + incomplete):
        row["rank"] = rank
        ordered.append(row)
        rank += 1

    for row in disqualified:
        row["rank"] = "DQ"
        ordered.append(row)

    return jsonify({"ok": True, "published": True, "results": ordered})


@app.post("/api/admin/config")
@admin_required
def admin_config():
    payload = request.get_json(silent=True) or {}
    s = db.game_state.find_one({"_id": "global"})
    if s and s.get("status") == "LIVE" and not payload.get("force"):
        return jsonify({"ok": False, "error": "Game is already LIVE. Clock configuration is locked."}), 409

    duration = max(60, min(24 * 3600, int(payload.get("duration_seconds", 3600))))
    token_buffer = max(0, min(300, int(payload.get("token_buffer_seconds", 20))))
    session_limit = max(10, min(1440, int(payload.get("session_limit_minutes", 180))))
    start_raw = str(payload.get("start_at", "")).strip()
    start_dt = None
    if start_raw:
        try:
            if start_raw.endswith("Z"):
                start_dt = datetime.fromisoformat(start_raw.replace("Z", "+00:00")).astimezone(timezone.utc)
            elif "+" in start_raw or (len(start_raw) > 10 and "-" in start_raw[10:]):
                start_dt = datetime.fromisoformat(start_raw).astimezone(timezone.utc)
            else:
                ist_tz = timezone(timedelta(hours=5, minutes=30))
                start_dt = datetime.fromisoformat(start_raw).replace(tzinfo=ist_tz).astimezone(timezone.utc)
        except Exception:
            pass

    room = str(payload.get("starting_room", "Seminar Hall 2")).strip()[:120]
    db.game_state.update_one(
        {"_id": "global"},
        {
            "$set": {
                "duration_seconds": duration,
                "token_buffer_seconds": token_buffer,
                "session_limit_minutes": session_limit,
                "start_at": start_dt,
                "starting_room": room or "Seminar Hall 2",
                "updated_at": now_ist(),
            },
            "$setOnInsert": {
                "status": "SETUP",
                "checkpoint_count": 10,
                "results_published": False,
            }
        },
        upsert=True
    )
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/teams")
@admin_required
def create_team():
    s = db.game_state.find_one({"_id": "global"})
    payload = request.get_json(silent=True) or {}
    if s and s.get("status") not in {"SETUP", "READY"} and not payload.get("force"):
        return jsonify({"ok": False, "error": "Team registration is locked after game start"}), 409

    name = " ".join(str(payload.get("team_name", "")).split())[:80]
    if not name:
        return jsonify({"ok": False, "error": "Team name required"}), 400

    code = team_code()
    while db.teams.find_one({"team_code": code}):
        code = team_code()

    s = db.game_state.find_one({"_id": "global"})
    game_status = "LIVE" if (s and s.get("status") == "LIVE") else "READY"
    doc = {
        "team_name": name,
        "team_code": code,
        "members": [],
        "status": game_status,
        "score": 0,
        "current_step": 0,
        "completed_locations": [],
        "created_at": now_ist(),
    }
    result = db.teams.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return jsonify({"ok": True, "team": doc})


@app.post("/api/admin/teams/delete")
@admin_required
def delete_team():
    payload = request.get_json(silent=True) or {}
    team_id = payload.get("team_id")
    if not team_id:
        return jsonify({"ok": False, "error": "team_id is required"}), 400
    try:
        oid = ObjectId(team_id)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid team_id"}), 400
    db.teams.delete_one({"_id": oid})
    db.players.delete_many({"team_id": oid})
    db.assignments.delete_many({"team_id": oid})
    db.scans.delete_many({"team_id": oid})
    return jsonify({"ok": True})


@app.post("/api/admin/teams/add-member")
@admin_required
def admin_add_member():
    payload = request.get_json(silent=True) or {}
    team_id = payload.get("team_id")
    name = " ".join(str(payload.get("name", "")).split())[:80]
    if not team_id or not name:
        return jsonify({"ok": False, "error": "team_id and player name are required"}), 400
    try:
        oid = ObjectId(team_id)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid team_id"}), 400
    team = db.teams.find_one({"_id": oid})
    if not team:
        return jsonify({"ok": False, "error": "Team not found"}), 404
    if len(team.get("members", [])) >= 3:
        return jsonify({"ok": False, "error": "Team already has max 3 members"}), 409

    player_id = ObjectId()
    joined = now_ist()
    db.players.insert_one({
        "_id": player_id,
        "name": name,
        "team_id": oid,
        "created_at": joined,
        "joined_at": joined,
    })
    db.teams.update_one(
        {"_id": oid},
        {"$push": {"members": {"name": name, "created_at": joined}}}
    )
    return jsonify({"ok": True})


@app.post("/api/admin/teams/remove-member")
@admin_required
def admin_remove_member():
    payload = request.get_json(silent=True) or {}
    team_id = payload.get("team_id")
    name = str(payload.get("name", "")).strip()
    if not team_id or not name:
        return jsonify({"ok": False, "error": "team_id and name are required"}), 400
    try:
        oid = ObjectId(team_id)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid team_id"}), 400
    db.teams.update_one({"_id": oid}, {"$pull": {"members": {"name": name}}})
    db.players.delete_one({"team_id": oid, "name": name})
    return jsonify({"ok": True})


@app.post("/api/admin/teams/disqualify")
@admin_required
def admin_disqualify_team():
    payload = request.get_json(silent=True) or {}
    team_id = payload.get("team_id")
    reason = str(payload.get("reason", "Disqualified by administrator")).strip()
    try:
        oid = ObjectId(team_id)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid team_id"}), 400
    db.teams.update_one({"_id": oid}, {"$set": {
        "status": "DISQUALIFIED",
        "disqualification_reason": reason,
        "disqualified_at": now_ist(),
    }})
    return jsonify({"ok": True})


@app.post("/api/admin/teams/reinstate")
@admin_required
def admin_reinstate_team():
    payload = request.get_json(silent=True) or {}
    team_id = payload.get("team_id")
    try:
        oid = ObjectId(team_id)
    except Exception:
        return jsonify({"ok": False, "error": "Invalid team_id"}), 400
    db.teams.update_one({"_id": oid}, {
        "$set": {"status": "READY"},
        "$unset": {"disqualification_reason": "", "disqualified_at": ""}
    })
    return jsonify({"ok": True})



@app.get("/api/admin/teams")
@admin_required
def list_teams():
    teams = []
    for t in db.teams.find().sort("created_at", ASCENDING):
        teams.append({
            "id": str(t["_id"]),
            "team_name": t["team_name"],
            "team_code": t["team_code"],
            "members": [{"name": m["name"], "created_at": iso(m["created_at"])} for m in t.get("members", [])],
            "members_count": len(t.get("members", [])),
            "score": t.get("score", 0),
            "status": t.get("status", "READY"),
            "completed": len(t.get("completed_locations", [])),
            "current_location": LOCATION_MAP.get(t.get("target_location_code") or "", ""),
            "finish_at": iso(t.get("finish_at")),
            "final_result_seconds": t.get("final_result_seconds"),
            "game_elapsed_seconds": t.get("game_elapsed_seconds"),
            "entry_differential_seconds": t.get("entry_differential_seconds"),
            "result_token_seconds": t.get("result_token_seconds"),
            "disqualification_reason": t.get("disqualification_reason"),
            "disqualified_at": iso(t.get("disqualified_at")),
        })
    return jsonify({"ok": True, "teams": teams})


@app.get("/api/admin/players")
@admin_required
def list_players():
    players = []
    for p in db.players.find().sort("created_at", DESCENDING):
        team = db.teams.find_one({"_id": p["team_id"]}) if p.get("team_id") else None
        players.append({
            "id": str(p["_id"]),
            "name": p.get("name", "Unknown"),
            "team_name": team.get("team_name", "Unknown") if team else "None",
            "team_code": team.get("team_code", "None") if team else "None",
            "team_status": team.get("status", "READY") if team else "None",
            "joined_at": iso(p.get("joined_at") or p.get("created_at")),
        })
    return jsonify({"ok": True, "players": players})


@app.get("/api/admin/locations")
@admin_required
def admin_locations():
    rows = []
    base = os.getenv("PUBLIC_APP_URL", request.host_url.rstrip("/"))
    for loc in db.checkpoints.find().sort("location_code", ASCENDING):
        payload = f"{base.rstrip('/')}/?scan={loc['qr_token']}"
        rows.append({
            "code": loc["location_code"],
            "name": loc["location_name"],
            "qr_token": loc["qr_token"],
            "scan_url": payload,
        })
    return jsonify({"ok": True, "locations": rows})


@app.get("/api/admin/puzzles")
@admin_required
def admin_puzzles():
    rows = []
    for p in db.puzzles.find().sort("location_code", ASCENDING).limit(500):
        rows.append({
            "id": str(p["_id"]),
            "puzzle_key": p.get("puzzle_key"),
            "location_code": p.get("location_code"),
            "location_name": LOCATION_MAP.get(p.get("location_code"), p.get("location_name", "")),
            "language": p.get("language"),
            "difficulty": p.get("difficulty"),
            "title": p.get("title"),
            "code": p.get("code", "")[:200] + ("..." if len(p.get("code", "")) > 200 else ""),
            "answer": p.get("answer") or p.get("expected_output"),
        })
    return jsonify({"ok": True, "puzzles": rows})


@app.post("/api/admin/puzzles")
@admin_required
def create_puzzle():
    payload = request.get_json(silent=True) or {}
    location = str(payload.get("location_code", ""))
    language = str(payload.get("language", "Python")).strip()
    code = str(payload.get("code", ""))
    answer = str(payload.get("answer", ""))

    if location not in LOCATION_MAP or language not in {"Python", "C++"} or not code.strip() or not answer.strip():
        return jsonify({"ok": False, "error": "Location, Python/C++, code and answer are required"}), 400

    p = {
        "puzzle_key": f"MAN-{secrets.token_hex(6)}",
        "location_code": location,
        "location_name": LOCATION_MAP[location],
        "language": language,
        "title": str(payload.get("title", f"{LOCATION_MAP[location]} Custom Puzzle"))[:120],
        "code": code[:25000],
        "answer": answer[:500],
        "expected_output": answer[:500],
        "accepted_answers": list({normalize_answer(answer), *[normalize_answer(x) for x in payload.get("accepted_answers", [])]}),
        "hint1": str(payload.get("hint1", ""))[:1000],
        "hint2": str(payload.get("hint2", ""))[:1000],
        "difficulty": str(payload.get("difficulty", "Medium"))[:20],
        "generated": False,
        "created_at": now_ist(),
    }
    db.puzzles.insert_one(p)
    return jsonify({"ok": True, "puzzle_key": p["puzzle_key"]})


@app.get("/api/admin/qr/<location_code>.png")
@admin_required
def qr_png(location_code: str):
    cp = db.checkpoints.find_one({"location_code": location_code})
    if not cp:
        return jsonify({"ok": False, "error": "Unknown location"}), 404

    base = os.getenv("PUBLIC_APP_URL", request.host_url.rstrip("/"))
    payload = f"{base.rstrip('/')}/?scan={cp['qr_token']}"
    image = qrcode.make(payload)

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png", as_attachment=False, download_name=f"{location_code}.png")


@app.get("/api/admin/qr/all")
@admin_required
def qr_all():
    buf = io.BytesIO()
    base = os.getenv("PUBLIC_APP_URL", request.host_url.rstrip("/"))
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for cp in db.checkpoints.find().sort("location_code", ASCENDING):
            img = qrcode.make(f"{base.rstrip('/')}/?scan={cp['qr_token']}")
            bio = io.BytesIO()
            img.save(bio, format="PNG")
            zf.writestr(f"{cp['location_code']}-{cp['location_name'].replace(' ', '_')}.png", bio.getvalue())
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True, download_name="scavenger-hunt-qr-codes.zip")


@app.get("/api/admin/scans")
@admin_required
def admin_scans():
    rows = []
    for s in db.scans.find().sort("timestamp", DESCENDING).limit(200):
        rows.append({
            "id": str(s["_id"]),
            "team_name": s.get("team_name", "Unknown"),
            "player_name": s.get("player_name", "Unknown"),
            "location_code": s.get("location_code"),
            "location_name": LOCATION_MAP.get(s.get("location_code"), ""),
            "expected_code": s.get("expected_code"),
            "expected_name": LOCATION_MAP.get(s.get("expected_code"), ""),
            "valid": s.get("valid", False),
            "reason": s.get("reason", ""),
            "timestamp": iso(s.get("timestamp") or s.get("scanned_at")),
        })
    return jsonify({"ok": True, "scans": rows})


@app.get("/api/admin/disqualifications")
@admin_required
def admin_disqualifications():
    disqualified = []
    for t in db.teams.find({"status": "DISQUALIFIED"}).sort("disqualified_at", DESCENDING):
        disqualified.append({
            "id": str(t["_id"]),
            "team_name": t.get("team_name"),
            "team_code": t.get("team_code"),
            "members": [m.get("name") for m in t.get("members", [])],
            "reason": t.get("disqualification_reason", "Wrong checkpoint scanned"),
            "expected": LOCATION_MAP.get(t.get("disqualification_expected", ""), t.get("disqualification_expected", "")),
            "scanned": LOCATION_MAP.get(t.get("disqualification_scanned", ""), t.get("disqualification_scanned", "")),
            "disqualified_at": iso(t.get("disqualified_at")),
        })
    return jsonify({"ok": True, "disqualifications": disqualified})


@app.post("/api/admin/prepare")
@admin_required
def prepare_game():
    s = db.game_state.find_one({"_id": "global"})
    if s.get("status") == "LIVE":
        return jsonify({"ok": False, "error": "Game already live"}), 409
    initialize_routes_and_assignments()
    db.game_state.update_one(
        {"_id": "global", "status": {"$in": ["SETUP", "READY"]}},
        {"$set": {"status": "READY", "updated_at": now_ist()}}
    )
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/start")
@admin_required
def manual_start():
    s = db.game_state.find_one({"_id": "global"})
    if s and s.get("status") == "LIVE":
        db.teams.update_many({"status": "READY"}, {"$set": {"status": "LIVE"}})
        return jsonify({"ok": True, "message": "Game is already live", "game": public_game_state()})

    initialize_routes_and_assignments()
    start = now_ist()
    result = db.game_state.find_one_and_update(
        {"_id": "global"},
        {"$set": {"status": "LIVE", "start_at": start, "updated_at": start}, "$unset": {"paused_remaining_seconds": ""}},
        return_document=ReturnDocument.AFTER,
    )
    db.teams.update_many({"status": "READY"}, {"$set": {"status": "LIVE"}})
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/end")
@admin_required
def manual_end():
    now = now_ist()
    db.game_state.update_one(
        {"_id": "global"},
        {"$set": {"status": "ENDED", "updated_at": now}, "$unset": {"paused_remaining_seconds": ""}}
    )
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/pause")
@admin_required
def pause_game():
    now = now_ist()
    s = db.game_state.find_one({"_id": "global"})
    if not s or s.get("status") != "LIVE":
        return jsonify({"ok": False, "error": "Only LIVE games can be paused"}), 409
    rem = remaining_seconds(s)
    db.game_state.update_one(
        {"_id": "global"},
        {"$set": {"status": "PAUSED", "paused_remaining_seconds": rem, "updated_at": now}}
    )
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/resume")
@admin_required
def resume_game():
    now = now_ist()
    s = db.game_state.find_one({"_id": "global"})
    if not s or s.get("status") != "PAUSED":
        return jsonify({"ok": False, "error": "Only PAUSED games can be resumed"}), 409
    rem = s.get("paused_remaining_seconds", 3600)
    dur = int(s.get("duration_seconds", 3600))
    new_start = now - timedelta(seconds=max(0, dur - rem))
    db.game_state.update_one(
        {"_id": "global"},
        {"$set": {"status": "LIVE", "start_at": new_start, "updated_at": now}, "$unset": {"paused_remaining_seconds": ""}}
    )
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/extend")
@admin_required
def extend_game():
    payload = request.get_json(silent=True) or {}
    seconds = int(payload.get("seconds", 300))
    db.game_state.update_one(
        {"_id": "global"},
        {"$inc": {"duration_seconds": seconds}, "$set": {"updated_at": now_ist()}}
    )
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/reset")
@admin_required
def reset_game():
    now = now_ist()
    db.game_state.update_one(
        {"_id": "global"},
        {
            "$set": {
                "status": "SETUP",
                "start_at": None,
                "results_published": False,
                "updated_at": now,
            },
            "$unset": {"paused_remaining_seconds": ""}
        }
    )
    # Reset team scores, steps, and status back to READY so teams can be re-run
    db.teams.update_many(
        {},
        {
            "$set": {
                "status": "READY",
                "score": 0,
                "current_step": 0,
                "completed_locations": [],
                "game_initialized": False,
                "hints_used": 0,
            },
            "$unset": {
                "route": "",
                "target_location_code": "",
                "target_assigned_at": "",
                "finish_at": "",
                "final_result_seconds": "",
                "game_elapsed_seconds": "",
                "entry_differential_seconds": "",
                "result_token_seconds": "",
                "disqualification_reason": "",
                "disqualified_at": "",
            }
        }
    )
    db.assignments.delete_many({})
    db.scans.delete_many({})
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/show-results")
@admin_required
def show_results():
    payload = request.get_json(silent=True) or {}
    force = bool(payload.get("force", False))
    maybe_auto_end_game()
    s = db.game_state.find_one({"_id": "global"})
    if s and s.get("status") != "ENDED" and not force:
        # If not ended and force isn't set, auto-end and publish
        db.game_state.update_one({"_id": "global"}, {"$set": {"status": "ENDED", "results_published": True, "updated_at": now_ist()}})
    else:
        db.game_state.update_one({"_id": "global"}, {"$set": {"results_published": True, "updated_at": now_ist()}})
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/unpublish-results")
@admin_required
def unpublish_results():
    db.game_state.update_one({"_id": "global"}, {"$set": {"results_published": False, "updated_at": now_ist()}})
    return jsonify({"ok": True, "game": public_game_state()})


@app.get("/api/admin/export-results")
@admin_required
def export_results():
    all_teams = list(db.teams.find())
    finishers = []
    incomplete = []
    disqualified = []
    for t in all_teams:
        completed_count = len(t.get("completed_locations", []))
        item = {
            "team": t.get("team_name", "Unknown"),
            "code": t.get("team_code", ""),
            "members": ", ".join(m.get("name", "") for m in t.get("members", [])),
            "score": int(t.get("score", 0)),
            "completed": completed_count,
            "status": t.get("status", "READY"),
            "final_result_seconds": t.get("final_result_seconds", ""),
            "finish_time": iso(t.get("finish_at")) or "",
            "disqualification_reason": t.get("disqualification_reason", ""),
        }
        if t.get("status") == "DISQUALIFIED":
            disqualified.append(item)
        elif completed_count >= 10 or t.get("status") == "FINISHED":
            finishers.append(item)
        else:
            incomplete.append(item)
    finishers.sort(key=lambda x: (x["final_result_seconds"] if isinstance(x["final_result_seconds"], (int, float)) else 999999, -x["score"]))
    incomplete.sort(key=lambda x: (-x["score"], x["final_result_seconds"] if isinstance(x["final_result_seconds"], (int, float)) else 999999))
    disqualified.sort(key=lambda x: (-x["score"], 999999))

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Rank", "Team Name", "Team Code", "Members", "Score", "Completed Checkpoints", "Status", "Final Seconds", "Finish Time", "Disqualification Reason"])
    for rank, r in enumerate(finishers + incomplete, 1):
        writer.writerow([rank, r["team"], r["code"], r["members"], r["score"], r["completed"], r["status"], r["final_result_seconds"], r["finish_time"], ""])
    for r in disqualified:
        writer.writerow(["DQ", r["team"], r["code"], r["members"], r["score"], r["completed"], r["status"], "", "", r.get("disqualification_reason", "Disqualified")])
    mem = io.BytesIO(buf.getvalue().encode("utf-8"))
    mem.seek(0)
    return send_file(mem, mimetype="text/csv", as_attachment=True, download_name="scavenger_hunt_results.csv")



@app.post("/api/join")
def join():
    payload = request.get_json(silent=True) or {}
    name = " ".join(str(payload.get("name", "")).split())[:80]
    code = str(payload.get("team_code", "")).strip().upper()

    if not name or not code:
        return jsonify({"ok": False, "error": "Name and team code are required"}), 400

    maybe_auto_end_game()
    s = db.game_state.find_one({"_id": "global"})
    if s.get("status") in {"LIVE", "ENDED"}:
        return jsonify({"ok": False, "error": "Registration is closed. Game has started or ended."}), 409

    team = db.teams.find_one({"team_code": code})
    if not team:
        return jsonify({"ok": False, "error": "Invalid team code"}), 404

    if len(team.get("members", [])) >= 3:
        return jsonify({"ok": False, "error": "Team already has the maximum of 3 members"}), 409

    player_id = ObjectId()
    joined = now_ist()

    # Atomic array size guard: max 3 members
    updated = db.teams.find_one_and_update(
        {"_id": team["_id"], "status": {"$in": ["READY", "SETUP"]}, "$expr": {"$lt": [{"$size": "$members"}, 3]}},
        {"$push": {"members": {"player_id": player_id, "name": name, "created_at": joined}}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        return jsonify({"ok": False, "error": "Could not join team; team is full (max 3 members) or locked"}), 409

    player = {"_id": player_id, "team_id": team["_id"], "name": name, "joined_at": joined, "created_at": joined}
    db.players.insert_one(player)

    raw = session_token()
    session_minutes = int(s.get("session_limit_minutes", 180)) if s else 180
    db.sessions.insert_one({
        "token_hash": token_hash(raw),
        "player_id": player_id,
        "created_at": joined,
        "expires_at": joined + timedelta(minutes=session_minutes),
    })

    response = make_response(jsonify({"ok": True, "player": {"name": name}, "team": {"name": team["team_name"], "code": code}}))
    response.set_cookie("player_session", raw, httponly=True, secure=bool(request.is_secure), samesite="Lax", path="/", max_age=2 * 86400)
    return response


@app.get("/api/me")
def me():
    maybe_auto_end_game()
    state = public_game_state()
    player = current_player()

    if not player:
        return jsonify({"ok": True, "authenticated": False, "game": state})

    team = team_for_player(player)
    if not team:
        return jsonify({"ok": False, "error": "Team not found"}), 404

    expected_code = team.get("target_location_code")
    assignment = db.assignments.find_one({"team_id": team["_id"], "location_code": expected_code}) if expected_code else None
    scanned_doc = db.scans.find_one({"team_id": team["_id"], "location_code": expected_code, "valid": True}) if expected_code else None
    puzzle = assignment.get("puzzle_snapshot") if assignment and scanned_doc else None

    is_live = state.get("status") == "LIVE"
    first_checkpoint = len(team.get("completed_locations", [])) == 0

    return jsonify({
        "ok": True,
        "authenticated": True,
        "game": state,
        "player": {"name": player["name"]},
        "team": {
            "name": team["team_name"],
            "code": team["team_code"],
            "status": team.get("status"),
            "score": team.get("score", 0),
            "completed": len(team.get("completed_locations", [])),
            "members_count": len(team.get("members", [])),
            "total": 10,
            "next_location_code": expected_code if is_live else None,
            "next_location_name": (LOCATION_MAP.get(expected_code, "") if is_live and (first_checkpoint or not scanned_doc) else None),
            "puzzle": puzzle if is_live and expected_code else None,
            "scanned": bool(scanned_doc),
        }
    })


@app.post("/api/scan")
def scan():
    """
    Authoritative Rule 12:
    If scanned_location != expected_location:
    IMMEDIATELY team.status = DISQUALIFIED. No warning. No retry.
    """
    maybe_auto_end_game()
    player = current_player()
    if not player:
        return jsonify({"ok": False, "error": "Join a team first"}), 401

    s = db.game_state.find_one({"_id": "global"})
    if s.get("status") != "LIVE" or remaining_seconds(s) <= 0:
        return jsonify({"ok": False, "error": "GAME_ENDED", "game": public_game_state()}), 409

    payload = request.get_json(silent=True) or {}
    token = str(payload.get("qr_token", "")).strip()

    cp = db.checkpoints.find_one({"qr_token": token})
    if not cp:
        return jsonify({"ok": False, "error": "Invalid physical QR token"}), 404

    team = team_for_player(player)
    if not team:
        return jsonify({"ok": False, "error": "Team not found"}), 404

    if team.get("status") == "DISQUALIFIED":
        return jsonify({"ok": False, "error": "TEAM_DISQUALIFIED"}), 403

    if team.get("status") == "FINISHED":
        return jsonify({"ok": False, "error": "TEAM_FINISHED", "message": "Your team has completed all 10 checkpoints!"}), 409

    expected = team.get("target_location_code")
    scanned = cp["location_code"]
    scan_time = now_ist()

    # Checkpoint already completed by a teammate check:
    # Do NOT disqualify or error. Instead, directly show the next location cleanly!
    if scanned in team.get("completed_locations", []):
        next_target = team.get("target_location_code")
        next_name = LOCATION_MAP.get(next_target, "") if next_target else "Base"
        is_finished = team.get("status") == "FINISHED"
        return jsonify({
            "ok": True,
            "already_cleared": True,
            "message": f"Checkpoint already cleared by your teammate! Head to {next_name}." if not is_finished else "All checkpoints completed by your team! Return to base.",
            "checkpoint": {"code": scanned, "name": LOCATION_MAP.get(scanned, scanned)},
            "next_location_code": next_target,
            "next_location_name": next_name,
            "finished": is_finished,
        })

    # WRONG CHECKPOINT SCAN -> INSTANT DISQUALIFICATION OF ENTIRE TEAM
    if scanned != expected:
        db.teams.update_one(
            {"_id": team["_id"], "status": {"$ne": "DISQUALIFIED"}},
            {"$set": {
                "status": "DISQUALIFIED",
                "disqualified_at": scan_time,
                "disqualification_reason": f"Wrong checkpoint scanned. Expected: {LOCATION_MAP.get(expected, expected)}. Scanned: {LOCATION_MAP.get(scanned, scanned)}",
                "disqualification_expected": expected,
                "disqualification_scanned": scanned,
                "disqualified_by_player_id": player["_id"],
            }}
        )
        db.scans.insert_one({
            "team_id": team["_id"],
            "team_name": team.get("team_name"),
            "player_id": player["_id"],
            "player_name": player.get("name"),
            "location_code": scanned,
            "expected_code": expected,
            "valid": False,
            "reason": "Wrong checkpoint scanned",
            "timestamp": scan_time,
        })
        return jsonify({
            "ok": False,
            "error": "TEAM_DISQUALIFIED",
            "reason": f"Wrong checkpoint scanned. Expected: {LOCATION_MAP.get(expected, expected)}. Scanned: {LOCATION_MAP.get(scanned, scanned)}",
        }), 403

    # CORRECT CHECKPOINT
    assignment = db.assignments.find_one({"team_id": team["_id"], "location_code": expected})
    if not assignment:
        assignment = generate_canonical_assignment(team, expected)

    db.scans.insert_one({
        "team_id": team["_id"],
        "team_name": team.get("team_name"),
        "player_id": player["_id"],
        "player_name": player.get("name"),
        "location_code": expected,
        "expected_code": expected,
        "valid": True,
        "timestamp": scan_time,
    })

    return jsonify({
        "ok": True,
        "checkpoint": {"code": expected, "name": LOCATION_MAP.get(expected, "")},
        "puzzle": assignment["puzzle_snapshot"],
    })


@app.post("/api/answer")
def answer():
    """
    Authoritative Rule 14 & 15:
    Validate answer server-side. Atomic state transitions protect against simultaneous submissions.
    Advance to next frozen checkpoint or FINISHED status.
    """
    maybe_auto_end_game()
    player = current_player()
    if not player:
        return jsonify({"ok": False, "error": "Join a team first"}), 401

    s = db.game_state.find_one({"_id": "global"})
    if s.get("status") != "LIVE" or remaining_seconds(s) <= 0:
        return jsonify({"ok": False, "error": "GAME_ENDED", "game": public_game_state()}), 409

    payload = request.get_json(silent=True) or {}
    answer_value = normalize_answer(str(payload.get("answer", "")))

    team = team_for_player(player)
    if not team:
        return jsonify({"ok": False, "error": "Team not found"}), 404

    if team.get("status") == "DISQUALIFIED":
        return jsonify({"ok": False, "error": "TEAM_DISQUALIFIED"}), 403

    if team.get("status") == "FINISHED":
        return jsonify({"ok": True, "correct": True, "finished": True, "message": "All checkpoints completed!"})

    step = int(team.get("current_step", 0))
    expected = team.get("target_location_code")
    if not expected:
        return jsonify({"ok": False, "error": "No active checkpoint target"}), 409

    assignment = db.assignments.find_one({"team_id": team["_id"], "location_code": expected})
    if not assignment:
        return jsonify({"ok": False, "error": "No assignment found for checkpoint"}), 409

    accepted = set(assignment["puzzle_snapshot"].get("accepted_answers", []))
    if answer_value not in accepted:
        return jsonify({"ok": False, "correct": False, "error": "Incorrect answer. Try again!"})

    event_time = now_ist()

    # Atomic state transition: Only ONE simultaneous submission awards point and increments step
    completed = db.teams.find_one_and_update(
        {
            "_id": team["_id"],
            "status": {"$in": ["LIVE", "READY"]},
            "current_step": step,
            "target_location_code": expected,
            "completed_locations": {"$ne": expected},
        },
        {
            "$set": {"status": "LIVE"},
            "$inc": {"score": 1, "current_step": 1},
            "$push": {"completed_locations": expected},
            "$pull": {"remaining_locations": expected},
        },
        return_document=ReturnDocument.AFTER,
    )

    if not completed:
        fresh_team = db.teams.find_one({"_id": team["_id"]})
        if fresh_team and expected in fresh_team.get("completed_locations", []):
            next_target = fresh_team.get("target_location_code")
            is_finished = fresh_team.get("status") == "FINISHED" or len(fresh_team.get("completed_locations", [])) >= 10
            return jsonify({
                "ok": True,
                "correct": True,
                "already_completed": True,
                "finished": is_finished,
                "message": "Your teammate already solved this checkpoint!" if not is_finished else "All checkpoints completed!",
                "next_location_code": next_target,
                "next_location_name": LOCATION_MAP.get(next_target, "") if next_target else None,
                "score": int(fresh_team.get("score", 0)),
                "completed": len(fresh_team.get("completed_locations", [])),
            })
        return jsonify({
            "ok": False,
            "error": "Checkpoint status out of sync. Please refresh the page.",
        }), 409

    # Record solved scan
    db.scans.insert_one({
        "team_id": team["_id"],
        "team_name": team.get("team_name"),
        "player_id": player["_id"],
        "player_name": player.get("name"),
        "location_code": expected,
        "valid": True,
        "solved": True,
        "timestamp": event_time,
    })

    # Timing calculation
    start_at = s.get("start_at") or event_time
    if isinstance(start_at, str):
        try:
            start_at = datetime.fromisoformat(start_at.replace("Z", "+00:00"))
        except Exception:
            start_at = event_time
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=timezone.utc)

    game_elapsed = max(0, (event_time - start_at).total_seconds())
    members = completed.get("members", [])
    entry_diff = 0
    for m in members:
        m_created = m.get("created_at")
        if isinstance(m_created, str):
            try:
                m_created = datetime.fromisoformat(m_created.replace("Z", "+00:00"))
            except Exception:
                m_created = start_at
        if isinstance(m_created, datetime):
            if m_created.tzinfo is None:
                m_created = m_created.replace(tzinfo=timezone.utc)
            entry_diff += max(0, (start_at - m_created).total_seconds())

    buf_sec = int(s.get("token_buffer_seconds", 20))
    final_seconds = int(round(game_elapsed + entry_diff + buf_sec))

    next_step = int(completed.get("current_step", 0))
    route = completed.get("route", [])

    if next_step >= 10:
        db.teams.update_one({"_id": team["_id"]}, {"$set": {
            "status": "FINISHED",
            "finish_at": event_time,
            "target_location_code": None,
            "target_assigned_at": None,
            "game_elapsed_seconds": int(game_elapsed),
            "entry_differential_seconds": int(entry_diff),
            "result_token_seconds": buf_sec,
            "final_result_seconds": final_seconds,
        }})
        return jsonify({
            "ok": True,
            "correct": True,
            "finished": True,
            "score": 10,
            "completed": 10,
            "final_result_seconds": final_seconds,
        })

    # Advance to the next frozen route checkpoint
    next_target = route[next_step] if next_step < len(route) else None
    db.teams.update_one({"_id": team["_id"]}, {"$set": {
        "target_location_code": next_target,
        "target_assigned_at": event_time,
        "game_elapsed_seconds": int(game_elapsed),
        "entry_differential_seconds": int(entry_diff),
        "result_token_seconds": buf_sec,
        "final_result_seconds": final_seconds,
    }})

    return jsonify({
        "ok": True,
        "correct": True,
        "finished": False,
        "score": int(completed.get("score", 0)),
        "completed": len(completed.get("completed_locations", [])),
        "next_location_code": next_target,
        "next_location_name": LOCATION_MAP.get(next_target, "") if next_target else None,
    })


@app.post("/api/hint")
def hint():
    player = current_player()
    if not player:
        return jsonify({"ok": False, "error": "Join a team first"}), 401

    maybe_auto_end_game()
    s = db.game_state.find_one({"_id": "global"})
    if s.get("status") != "LIVE" or remaining_seconds(s) <= 0:
        return jsonify({"ok": False, "error": "Game is not live"}), 409

    team = team_for_player(player)
    if not team or team.get("status") == "DISQUALIFIED":
        return jsonify({"ok": False, "error": "TEAM_DISQUALIFIED"}), 403

    expected = team.get("target_location_code")
    if not expected:
        return jsonify({"ok": False, "error": "No active checkpoint"}), 409

    assignment = db.assignments.find_one({"team_id": team["_id"], "location_code": expected})
    if not assignment:
        return jsonify({"ok": False, "error": "No active puzzle assignment"}), 409

    level = int((request.get_json(silent=True) or {}).get("level", 1))
    key = "hint1" if level == 1 else "hint2"
    text = assignment["puzzle_snapshot"].get(key, "No hint available.")
    db.teams.update_one({"_id": team["_id"]}, {"$inc": {"hints_used": 1}})
    return jsonify({"ok": True, "hint": text})


@app.before_request
def before():
    if db is not None:
        try:
            if not _db_initialized:
                ensure_db()
        except Exception as e:
            app.logger.warning(f"ensure_db in before_request failed: {e}")
        try:
            maybe_auto_end_game()
        except Exception as e:
            app.logger.warning(f"maybe_auto_end_game in before_request failed: {e}")



if __name__ == "__main__":
    try:
        ensure_db()
    except Exception as e:
        app.logger.warning(f"Initial ensure_db warning: {e}")
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True, use_reloader=True)

