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
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument
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

client = MongoClient(MONGO_URI, tlsCAFile=ca_file) if (MONGO_URI and ca_file) else (MongoClient(MONGO_URI) if MONGO_URI else None)
db = client[DB_NAME] if client is not None else None
_db_initialized = False


LOCATIONS = [
    {"code": "LOC-01", "name": "Auditorium"},
    {"code": "LOC-02", "name": "Mountain Dew Ground"},
    {"code": "LOC-03", "name": "Fourteen"},
    {"code": "LOC-04", "name": "Stationary"},
    {"code": "LOC-05", "name": "Gym"},
    {"code": "LOC-06", "name": "Green Circle — IMR Wala Garden"},
    {"code": "LOC-07", "name": "Guard Wale Uncle"},
    {"code": "LOC-08", "name": "Saraswati Mata Murti — A Block"},
    {"code": "LOC-09", "name": "Book Bank"},
    {"code": "LOC-10", "name": "F Block Hawamahal"},
]
LOCATION_MAP = {x["code"]: x["name"] for x in LOCATIONS}


def now_ist() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.astimezone(timezone(timedelta(hours=5, minutes=30))).isoformat()


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
                    "qr_token": f"SHT2|{loc['code']}|{secrets.token_urlsafe(12)}",
                    "created_at": now_ist(),
                })
        _db_initialized = True
    except Exception as e:
        app.logger.warning(f"ensure_db notice: {e}")



def password_ok(password: str) -> bool:
    if ADMIN_PASSWORD_HASH:
        from werkzeug.security import check_password_hash
        return check_password_hash(ADMIN_PASSWORD_HASH, password)
    fallback = os.getenv("ADMIN_PASSWORD", "")
    return bool(fallback) and hmac.compare_digest(fallback, password)


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
        if raw_start.tzinfo is None:
            raw_start = raw_start.replace(tzinfo=timezone.utc)
        state["start_at"] = iso(raw_start)
        end = raw_start + timedelta(seconds=int(s.get("duration_seconds", 3600)))
        state["end_at"] = iso(end)
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


def select_unique_puzzle(team_id: ObjectId, location_code: str) -> dict[str, Any]:
    # Ensure no two teams receive the same question at this physical location.
    assigned_keys = {x["puzzle_key"] for x in db.assignments.find({"location_code": location_code}, {"puzzle_key": 1})}
    candidates = list(db.puzzles.find({"location_code": location_code, "puzzle_key": {"$nin": list(assigned_keys)}}))
    if candidates:
        return secrets.choice(candidates)

    # Fallback to any puzzle at this location if all uniquely exhausted
    all_candidates = list(db.puzzles.find({"location_code": location_code}))
    if all_candidates:
        return secrets.choice(all_candidates)

    # Deterministic fallback generator if database had 0 puzzles for this location
    seed_text = hashlib.sha256(f"{team_id}:{location_code}:{secrets.token_hex(8)}".encode()).hexdigest()
    seed = int(seed_text[:12], 16)
    return generate_variant_puzzle(location_code, seed)


def generate_variant_puzzle(location_code: str, seed: int) -> dict[str, Any]:
    clue_map = {
        "LOC-01": ("STAGE MIC SHOW", "Auditorium"),
        "LOC-02": ("GREEN BOTTLE + MOUNTAIN", "Mountain Dew Ground"),
        "LOC-03": ("7 + 7", "Fourteen"),
        "LOC-04": ("PEN + PAPER", "Stationary"),
        "LOC-05": ("IRON + REPS", "Gym"),
        "LOC-06": ("GREEN + CIRCLE + GARDEN", "Green Circle — IMR Wala Garden"),
        "LOC-07": ("SECURITY + GATE + UNCLE", "Guard Wale Uncle"),
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
    if existing:
        return existing
    puzzle = select_unique_puzzle(team["_id"], location_code)
    hints = puzzle.get("hints", [])
    hint1 = puzzle.get("hint1") or (hints[0] if len(hints) > 0 else "Trace or execute the code carefully.")
    hint2 = puzzle.get("hint2") or (hints[1] if len(hints) > 1 else "The output is an indirect clue to your next destination.")
    assignment = {
        "team_id": team["_id"],
        "location_code": location_code,
        "puzzle_key": puzzle["puzzle_key"],
        "assigned_at": now_ist(),
        "puzzle_snapshot": {
            "title": puzzle.get("title", f"{LOCATION_MAP.get(location_code, location_code)} Challenge"),
            "language": puzzle.get("language", "Python"),
            "code": puzzle.get("code", ""),
            "hint1": hint1,
            "hint2": hint2,
            "difficulty": puzzle.get("difficulty", "Medium"),
            "accepted_answers": puzzle.get("accepted_answers", [normalize_answer(puzzle.get("answer") or puzzle.get("expected_output") or "")]),
        },
    }
    db.assignments.update_one(
        {"team_id": team["_id"], "location_code": location_code},
        {"$setOnInsert": assignment},
        upsert=True,
    )
    return db.assignments.find_one({"team_id": team["_id"], "location_code": location_code})


def initialize_routes_and_assignments() -> None:
    """
    Authoritative Rule 2 & 17:
    Generate and freeze a complete randomized route containing all 10 locations exactly once
    separately for every team. Pre-assign unique puzzles per team/location and freeze them.
    """
    teams = list(db.teams.find({"status": {"$ne": "DISQUALIFIED"}}))
    all_codes = [x["code"] for x in LOCATIONS]

    existing_routes = [tuple(t.get("route", [])) for t in teams if t.get("route")]

    for team in teams:
        if team.get("game_initialized") and team.get("route") and len(team.get("route")) == 10:
            continue

        # Deterministically generate a unique permutation
        shuffled = list(all_codes)
        for _ in range(20):
            random.shuffle(shuffled)
            if tuple(shuffled) not in existing_routes or len(teams) > 3628800:
                break
        existing_routes.append(tuple(shuffled))

        first_target = shuffled[0]
        db.teams.update_one({"_id": team["_id"]}, {"$set": {
            "route": shuffled,
            "current_step": 0,
            "score": 0,
            "completed_locations": [],
            "remaining_locations": shuffled,
            "target_location_code": first_target,
            "target_assigned_at": now_ist(),
            "status": "READY",
            "game_initialized": True,
            "hints_used": 0,
        }})

        # Pre-generate and freeze unique puzzle assignments for all 10 checkpoints
        team_doc = db.teams.find_one({"_id": team["_id"]})
        for loc_code in shuffled:
            generate_canonical_assignment(team_doc, loc_code)


def remaining_seconds(state: dict[str, Any]) -> int:
    if not state.get("start_at"):
        return int(state.get("duration_seconds", 3600))
    start = state["start_at"]
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end = start + timedelta(seconds=int(state.get("duration_seconds", 3600)))
    return max(0, int((end - now_ist()).total_seconds()))


def maybe_auto_start_game() -> None:
    if db is None:
        return
    s = db.game_state.find_one({"_id": "global"})
    if not s or s.get("status") not in {"SETUP", "READY"} or not s.get("start_at"):
        return
    now = now_ist()
    start = s["start_at"]
    # Normalize: if MongoDB returned a tz-naive datetime, assume UTC
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if now < start:
        return
    initialize_routes_and_assignments()
    db.game_state.update_one(
        {"_id": "global", "status": {"$in": ["SETUP", "READY"]}, "start_at": {"$lte": now}},
        {"$set": {"status": "LIVE", "updated_at": now}}
    )


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
    response.set_cookie("admin_session", token, httponly=True, secure=bool(request.is_secure), samesite="Lax", max_age=7 * 86400)
    return response


@app.post("/api/admin/logout")
@admin_required
def admin_logout():
    response = make_response(jsonify({"ok": True}))
    response.delete_cookie("admin_session")
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

    valid_teams = list(db.teams.find({"status": {"$ne": "DISQUALIFIED"}}))

    finishers = []
    incomplete = []

    for t in valid_teams:
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
        }
        if completed_count >= 10 or t.get("status") == "FINISHED":
            finishers.append(item)
        else:
            incomplete.append(item)

    # Sort finishers by final_result_seconds ASC
    finishers.sort(key=lambda x: (x["final_result_seconds"] if x["final_result_seconds"] is not None else float("inf"), x["score"]))

    # Sort incomplete by score DESC, then final_result_seconds / elapsed ASC
    incomplete.sort(key=lambda x: (-x["score"], x["final_result_seconds"] if x["final_result_seconds"] is not None else float("inf")))

    ordered = finishers + incomplete
    for i, row in enumerate(ordered, 1):
        row["rank"] = i

    return jsonify({"ok": True, "published": True, "results": ordered})


@app.post("/api/admin/config")
@admin_required
def admin_config():
    payload = request.get_json(silent=True) or {}
    s = db.game_state.find_one({"_id": "global"})
    if s and s.get("status") == "LIVE":
        return jsonify({"ok": False, "error": "Game is already LIVE. Clock configuration is locked."}), 409

    duration = max(60, min(24 * 3600, int(payload.get("duration_seconds", 3600))))
    token_buffer = max(0, min(300, int(payload.get("token_buffer_seconds", 20))))
    session_limit = max(10, min(1440, int(payload.get("session_limit_minutes", 180))))
    start_raw = str(payload.get("start_at", "")).strip()
    start_dt = None
    if start_raw:
        try:
            start_dt = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone(timedelta(hours=5, minutes=30))).astimezone(timezone.utc)
        except Exception:
            pass

    room = str(payload.get("starting_room", "Seminar Hall 2")).strip()[:120]
    db.game_state.update_one(
        {"_id": "global", "status": {"$in": ["SETUP", "READY"]}},
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
    if s.get("status") not in {"SETUP", "READY"}:
        return jsonify({"ok": False, "error": "Team registration is locked after game start"}), 409

    payload = request.get_json(silent=True) or {}
    name = " ".join(str(payload.get("team_name", "")).split())[:80]
    if not name:
        return jsonify({"ok": False, "error": "Team name required"}), 400

    code = team_code()
    while db.teams.find_one({"team_code": code}):
        code = team_code()

    doc = {
        "team_name": name,
        "team_code": code,
        "members": [],
        "status": "READY",
        "score": 0,
        "current_step": 0,
        "completed_locations": [],
        "created_at": now_ist(),
    }
    result = db.teams.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return jsonify({"ok": True, "team": doc})


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
    for loc in db.checkpoints.find().sort("location_code", ASCENDING):
        rows.append({
            "code": loc["location_code"],
            "name": loc["location_name"],
            "qr_token": loc["qr_token"],
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
    if s.get("status") == "LIVE":
        return jsonify({"ok": False, "error": "Game is already live"}), 409
    if s.get("status") == "ENDED":
        return jsonify({"ok": False, "error": "Game has ended"}), 409

    initialize_routes_and_assignments()
    start = now_ist()
    result = db.game_state.find_one_and_update(
        {"_id": "global", "status": {"$in": ["SETUP", "READY"]}},
        {"$set": {"status": "LIVE", "start_at": start, "updated_at": start}},
        return_document=ReturnDocument.AFTER,
    )
    if not result or result.get("status") != "LIVE":
        return jsonify({"ok": False, "error": "Could not start game"}), 409
    return jsonify({"ok": True, "game": public_game_state()})


@app.post("/api/admin/show-results")
@admin_required
def show_results():
    maybe_auto_end_game()
    s = db.game_state.find_one({"_id": "global"})
    if s.get("status") != "ENDED":
        return jsonify({"ok": False, "error": "Results can be published only after game end"}), 409
    db.game_state.update_one({"_id": "global"}, {"$set": {"results_published": True, "updated_at": now_ist()}})
    return jsonify({"ok": True})


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
    response.set_cookie("player_session", raw, httponly=True, secure=bool(request.is_secure), samesite="Lax", max_age=2 * 86400)
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
            "next_location_name": (LOCATION_MAP.get(expected_code, "") if is_live and first_checkpoint else None),
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

    # Checkpoint already completed check
    if scanned in team.get("completed_locations", []):
        return jsonify({"ok": False, "error": "ALREADY_COMPLETED", "message": "Checkpoint already completed."}), 409

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
            "status": "LIVE",
            "current_step": step,
            "target_location_code": expected,
            "completed_locations": {"$ne": expected},
        },
        {
            "$inc": {"score": 1, "current_step": 1},
            "$push": {"completed_locations": expected},
            "$pull": {"remaining_locations": expected},
        },
        return_document=ReturnDocument.AFTER,
    )

    if not completed:
        return jsonify({
            "ok": True,
            "correct": True,
            "already_completed": True,
            "message": "Your teammate already solved this checkpoint.",
        })

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
    game_elapsed = max(0, (event_time - start_at).total_seconds())
    members = completed.get("members", [])
    entry_diff = sum(max(0, (start_at - m["created_at"]).total_seconds()) for m in members)
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
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False, use_reloader=False)

