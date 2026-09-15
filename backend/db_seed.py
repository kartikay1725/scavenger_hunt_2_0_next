import json
import os
from pathlib import Path
from pymongo import MongoClient, UpdateOne

BACKEND_DIR = Path(__file__).resolve().parent

# Load .env file if present
env_file = BACKEND_DIR / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

mongo_uri = os.getenv("MONGODB_URI")
if not mongo_uri:
    raise ValueError("MONGODB_URI environment variable is not set. Please check backend/.env")

db_name = os.getenv("MONGODB_DB", "scavenger_hunt_2_0")

json_path = BACKEND_DIR / "scavenger_hunt_2_0_question_bank.json"
with open(json_path, "r", encoding="utf-8") as f:
    bank = json.load(f)

raw_puzzles = bank.get("puzzles", [])
if not raw_puzzles:
    print("No puzzles found in question bank JSON.")
    exit(0)

client = MongoClient(mongo_uri)
db = client[db_name]

# Map JSON schema to the schema expected by app.py:
# - puzzle_id -> puzzle_key
# - location_id -> location_code
# - hints -> hint1, hint2
operations = []
for p in raw_puzzles:
    puzzle_key = p.get("puzzle_id")
    location_code = p.get("location_id")
    hints = p.get("hints", [])
    
    doc = {
        "puzzle_key": puzzle_key,
        "location_code": location_code,
        "location_name": p.get("location_name", ""),
        "title": p.get("title", ""),
        "language": p.get("language", ""),
        "difficulty": p.get("difficulty", "Medium"),
        "code": p.get("code", ""),
        "answer": p.get("expected_output", ""),
        "expected_output": p.get("expected_output", ""),
        "accepted_answers": p.get("accepted_answers", []),
        "hint1": hints[0] if len(hints) > 0 else "",
        "hint2": hints[1] if len(hints) > 1 else "",
        "tags": p.get("tags", []),
        "version": p.get("version", 1),
    }

    operations.append(
        UpdateOne(
            {"puzzle_key": puzzle_key, "location_code": location_code},
            {"$set": doc},
            upsert=True,
        )
    )

result = db.puzzles.bulk_write(operations)
print(f"Database: {db_name}")
print(f"Total processed: {len(operations)} puzzles")
print(f"Upserted: {len(result.upserted_ids)}, Modified: {result.modified_count}, Matched: {result.matched_count}")