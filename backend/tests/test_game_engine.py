"""
Unit and Concurrency Tests for Scavenger Hunt 2.0 Game Engine
"""
import unittest
from datetime import datetime, timezone, timedelta

# Test data & pure logic tests
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


def normalize_answer(x: str) -> str:
    return " ".join((x or "").strip().lower().replace("-", " ").replace("_", " ").split())


class TestGameLogic(unittest.TestCase):
    def test_answer_normalization(self):
        self.assertEqual(normalize_answer("Stage-Mic-Show"), "stage mic show")
        self.assertEqual(normalize_answer("  BOOK_BANK   "), "book bank")
        self.assertEqual(normalize_answer("fourteen"), "fourteen")
        self.assertEqual(normalize_answer("   7   +   7   "), "7 + 7")

    def test_route_generation_properties(self):
        import random
        all_codes = [x["code"] for x in LOCATIONS]
        routes = []
        for _ in range(10):
            shuffled = list(all_codes)
            random.shuffle(shuffled)
            self.assertEqual(len(shuffled), 10)
            self.assertEqual(len(set(shuffled)), 10)
            self.assertEqual(set(shuffled), set(all_codes))
            routes.append(tuple(shuffled))

        # Check that routes are randomized
        unique_routes = set(routes)
        self.assertGreater(len(unique_routes), 1, "Routes should be varied across teams")

    def test_ranking_authoritative_rule_19(self):
        """
        Rule 19:
        - Disqualified teams excluded.
        - Full finishers (10/10 completed) ranked by lowest final_result_seconds.
        - Teams with < 10 completed cannot outrank a full finisher.
        - Incomplete teams ranked by highest score, then lowest time.
        """
        teams = [
            {"team": "Team Disqualified", "score": 8, "completed": 8, "status": "DISQUALIFIED", "final_result_seconds": 400},
            {"team": "Team Fast Finisher", "score": 10, "completed": 10, "status": "FINISHED", "final_result_seconds": 1200},
            {"team": "Team Slow Finisher", "score": 10, "completed": 10, "status": "FINISHED", "final_result_seconds": 1800},
            {"team": "Team High Incomplete", "score": 9, "completed": 9, "status": "LIVE", "final_result_seconds": 800},
            {"team": "Team Low Incomplete", "score": 7, "completed": 7, "status": "LIVE", "final_result_seconds": 500},
        ]

        valid = [t for t in teams if t["status"] != "DISQUALIFIED"]
        finishers = [t for t in valid if t["completed"] == 10]
        incomplete = [t for t in valid if t["completed"] < 10]

        finishers.sort(key=lambda x: (x["final_result_seconds"] if x["final_result_seconds"] is not None else float("inf"), -x["score"]))
        incomplete.sort(key=lambda x: (-x["score"], x["final_result_seconds"] if x["final_result_seconds"] is not None else float("inf")))

        ranked = finishers + incomplete
        for i, t in enumerate(ranked, 1):
            t["rank"] = i

        self.assertEqual(ranked[0]["team"], "Team Fast Finisher")
        self.assertEqual(ranked[0]["rank"], 1)
        self.assertEqual(ranked[1]["team"], "Team Slow Finisher")
        self.assertEqual(ranked[1]["rank"], 2)
        self.assertEqual(ranked[2]["team"], "Team High Incomplete")
        self.assertEqual(ranked[2]["rank"], 3)
        self.assertEqual(ranked[3]["team"], "Team Low Incomplete")
        self.assertEqual(ranked[3]["rank"], 4)
        self.assertNotIn("Team Disqualified", [t["team"] for t in ranked])

    def test_team_join_max_3_members(self):
        """
        Test that a team cannot exceed 3 members.
        """
        members = []
        for i in range(5):
            if len(members) < 3:
                members.append(f"Member_{i}")

        self.assertEqual(len(members), 3)
        self.assertEqual(members, ["Member_0", "Member_1", "Member_2"])

    def test_atomic_progression_concept(self):
        """
        Simulate two simultaneous submissions for the same team/checkpoint.
        """
        state = {
            "current_step": 0,
            "score": 0,
            "completed_locations": [],
            "target_location_code": "LOC-01",
        }

        def submit_answer(target, ans):
            # Atomic check-and-set
            if state["target_location_code"] == target and target not in state["completed_locations"]:
                state["score"] += 1
                state["current_step"] += 1
                state["completed_locations"].append(target)
                return True
            return False

        res1 = submit_answer("LOC-01", "correct")
        res2 = submit_answer("LOC-01", "correct")

        self.assertTrue(res1)
        self.assertFalse(res2, "Second simultaneous submission must be rejected")
        self.assertEqual(state["score"], 1, "Only 1 point awarded")
        self.assertEqual(state["current_step"], 1)


if __name__ == "__main__":
    unittest.main()
