#!/usr/bin/env python3
"""
Question Bank Seed Tool for Scavenger Hunt 2.0 — CodeChef
Usage: python tools/seed_question_bank.py [path_to_question_bank.json]
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from pymongo import MongoClient, UpdateOne

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
    print("ERROR: MONGODB_URI environment variable is not set. Check backend/.env", file=sys.stderr)
    sys.exit(1)

DB_NAME = os.getenv("MONGODB_DB", "scavenger_hunt_2_0")


def normalize_answer(x: str) -> str:
    return " ".join((x or "").strip().lower().replace("-", " ").replace("_", " ").split())


def seed(json_file: Path | str | None = None) -> None:
    if not json_file:
        json_file = BACKEND_DIR / "scavenger_hunt_2_0_question_bank.json"
    else:
        json_file = Path(json_file)

    if not json_file.exists():
        print(f"ERROR: Question bank file not found: {json_file}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading question bank from: {json_file}")
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    puzzles = data.get("puzzles", [])
    if not puzzles:
        print("ERROR: No puzzles found in question bank JSON.", file=sys.stderr)
        sys.exit(1)

    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]

    operations = []
    skipped = 0
    locations_count: dict[str, int] = {}
    languages_count: dict[str, int] = {}

    for idx, p in enumerate(puzzles):
        puzzle_key = p.get("puzzle_id")
        location_code = p.get("location_id")
        code = p.get("code")
        expected_output = p.get("expected_output") or p.get("answer")

        # Validate required fields
        if not puzzle_key or not location_code or not code or not expected_output:
            print(f"WARNING: Skipping invalid puzzle at index {idx} (missing required fields)")
            skipped += 1
            continue

        language = p.get("language", "python").capitalize()
        if language.lower() == "c++":
            language = "C++"
        elif language.lower() == "python":
            language = "Python"

        hints = p.get("hints", [])
        hint1 = hints[0] if len(hints) > 0 else "Trace or execute the program to find the clue."
        hint2 = hints[1] if len(hints) > 1 else "The program output points to a campus location."

        accepted = [normalize_answer(expected_output)]
        for ans in p.get("accepted_answers", []):
            norm = normalize_answer(ans)
            if norm and norm not in accepted:
                accepted.append(norm)

        doc = {
            "puzzle_key": puzzle_key,
            "location_code": location_code,
            "location_name": p.get("location_name", ""),
            "title": p.get("title", f"{location_code} Challenge"),
            "language": language,
            "difficulty": (p.get("difficulty") or "Medium").capitalize(),
            "code": code,
            "answer": expected_output,
            "expected_output": expected_output,
            "accepted_answers": accepted,
            "hint1": hint1,
            "hint2": hint2,
            "tags": p.get("tags", []),
            "version": p.get("version", 1),
            "enabled": p.get("enabled", True),
            "approved": p.get("approved", True),
        }

        operations.append(
            UpdateOne(
                {"puzzle_key": puzzle_key, "location_code": location_code},
                {"$set": doc},
                upsert=True,
            )
        )

        locations_count[location_code] = locations_count.get(location_code, 0) + 1
        languages_count[language] = languages_count.get(language, 0) + 1

    if operations:
        result = db.puzzles.bulk_write(operations)
        print("=" * 60)
        print("QUESTION BANK IMPORT SUMMARY")
        print("=" * 60)
        print(f"Target Database: {DB_NAME}")
        print(f"Total Processed: {len(operations)} puzzles")
        print(f"Upserted (New):  {len(result.upserted_ids)}")
        print(f"Updated (Existing): {result.modified_count}")
        print(f"Matched (Unchanged): {result.matched_count}")
        print(f"Skipped Invalid: {skipped}")
        print("-" * 60)
        print("By Location:")
        for loc in sorted(locations_count.keys()):
            print(f"  {loc}: {locations_count[loc]} puzzles")
        print("By Language:")
        for lang, count in languages_count.items():
            print(f"  {lang}: {count} puzzles")
        print("=" * 60)
        print("✓ Import completed successfully.")


if __name__ == "__main__":
    filepath = sys.argv[1] if len(sys.argv) > 1 else None
    seed(filepath)
