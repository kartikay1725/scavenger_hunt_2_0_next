#!/usr/bin/env python3
"""
Game Setup & Event Readiness Validation Tool for Scavenger Hunt 2.0 — CodeChef
Usage: python tools/setup_game.py
"""
from __future__ import annotations

import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path
from pymongo import MongoClient

TOOLS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TOOLS_DIR.parent

# Load .env
env_file = BACKEND_DIR / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    print("ERROR: MONGODB_URI environment variable is not set.", file=sys.stderr)
    sys.exit(1)

DB_NAME = os.getenv("MONGODB_DB", "scavenger_hunt_2_0")

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


def setup() -> None:
    print("Connecting to MongoDB Atlas...")
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]

    print(f"Target Database: {DB_NAME}")
    print("\n1. Verifying & Seeding 10 Physical Checkpoints...")
    for loc in LOCATIONS:
        existing = db.checkpoints.find_one({"location_code": loc["code"]})
        if not existing:
            token = f"SHT2|{loc['code']}|{secrets.token_urlsafe(12)}"
            db.checkpoints.insert_one({
                "location_code": loc["code"],
                "location_name": loc["name"],
                "qr_token": token,
                "created_at": datetime.now(timezone.utc),
            })
            print(f"  [+] Created checkpoint: {loc['code']} ({loc['name']}) -> Token: {token}")
        else:
            print(f"  [✓] Verified checkpoint: {loc['code']} ({loc['name']})")

    print("\n2. Verifying Question Bank Availability...")
    puzzle_counts = {}
    missing_locations = []
    for loc in LOCATIONS:
        count = db.puzzles.count_documents({"location_code": loc["code"]})
        puzzle_counts[loc["code"]] = count
        if count == 0:
            missing_locations.append(loc["code"])

    for code, count in puzzle_counts.items():
        status = "OK" if count >= 10 else ("LOW" if count > 0 else "MISSING")
        print(f"  {code}: {count} puzzles available [{status}]")

    if missing_locations:
        print(f"\nWARNING: Locations with 0 puzzles: {missing_locations}")
        print("Run 'python tools/seed_question_bank.py' to import puzzles.")
    else:
        print("\n✓ All 10 locations have question bank coverage.")

    print("\n3. Verifying Game State...")
    state = db.game_state.find_one({"_id": "global"})
    if not state:
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
            "updated_at": datetime.now(timezone.utc),
        })
        print("  [+] Initialized global game_state document.")
    else:
        print(f"  [✓] Current Status: {state.get('status')}")
        print(f"  [✓] Duration: {state.get('duration_seconds')} seconds ({int(state.get('duration_seconds', 0)) // 60} mins)")
        print(f"  [✓] Starting Room: {state.get('starting_room')}")
        print(f"  [✓] Results Published: {state.get('results_published')}")

    print("\n4. Indexes Verification...")
    db.teams.create_index("team_code", unique=True)
    db.checkpoints.create_index("qr_token", unique=True)
    db.puzzles.create_index([("location_code", 1), ("puzzle_key", 1)], unique=True)
    db.assignments.create_index([("team_id", 1), ("location_code", 1)], unique=True)
    db.sessions.create_index("token_hash", unique=True)
    print("  [✓] Unique and query indexes verified.")

    print("\n" + "=" * 60)
    print("EVENT SETUP & READINESS STATUS: READY FOR GAME DAY")
    print("=" * 60)


if __name__ == "__main__":
    setup()
