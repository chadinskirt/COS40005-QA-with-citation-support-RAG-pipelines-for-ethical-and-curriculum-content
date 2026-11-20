from recommender import load_curriculum, validate_curriculum, generate_candidates
import networkx as nx
from typing import List, Dict, Any
from models import SessionLocal # type: ignore

def inspect_candidates(
    major_id: str,
    completed_codes: List[str]
):
    db = SessionLocal()

    try:
        # 1. Load curriculum
        G, catalog, major_curriculum = load_curriculum(
            db, major_id
        )

        # 2. Validate
        validate_curriculum(G, catalog)

        completed = set(completed_codes)

        if not completed.issubset(catalog):
            raise ValueError("Unknown completed course codes")

        remaining = major_curriculum - completed
        scheduled = completed.copy()

        # 3. Generate initial candidates
        candidates = generate_candidates(
            G, remaining, scheduled
        )

        # 4. Print results
        print("\n========== CURRICULUM ==========")
        print(f"Major ID: {major_id}")
        print(f"Total courses: {len(major_curriculum)}")
        print(f"Completed: {len(completed)}")
        print(f"Remaining: {len(remaining)}")

        print("\n========== ELIGIBLE CANDIDATES ==========")

        for code in candidates:
            course = catalog[code]

            print(
                f"{code} | "
                f"{course['name']} | "
                f"{course['credit_points']} CP"
            )

        print(f"\nTotal eligible: {len(candidates)}")

    finally:
        db.close()


def main():
    major_id = "CS_AI_ENGINEERING"

    completed_codes = [
        "COS10009",
        "COS20007"
    ]

    inspect_candidates(
        major_id,
        completed_codes
    )


if __name__ == "__main__":
    main()