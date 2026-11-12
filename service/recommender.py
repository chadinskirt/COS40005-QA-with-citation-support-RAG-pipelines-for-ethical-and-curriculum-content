import networkx as nx
from typing import List, Dict, Any
from models import SessionLocal, Course, Prerequisite # type: ignore

class CurriculumCycleError(Exception):
    def __init__(self, cycle_nodes):
        self.cycle_nodes = cycle_nodes

def build_curriculum_graph(db) -> nx.DiGraph:
    """Builds the prerequisite DAG dynamically from the PostgreSQL database."""
    G = nx.DiGraph()
    prereqs = db.query(Prerequisite).all()
    for p in prereqs:
        G.add_edge(p.prerequisite_code, p.dependent_code, rule_type=p.rule_type)
    return G

# 1. Fetch live data from PostgreSQL and build DAG
def load_curriculum(db, major_id):
    """Builds the prerequisite DAG dynamically from the PostgreSQL database."""
    G = build_curriculum_graph(db)

    all_courses = db.query(Course).all()

    catalog = {
        c.code: {
            "name": c.name,
            "credit_points": c.credit_points
        }
        for c in all_courses
    }

    # TODO: Filter using the major-course mapping.
    major_curriculum = set(catalog.keys())

    return G, catalog, major_curriculum

# 2. Cycle Detection (Risk 4 mitigation)
def validate_curriculum(G, catalog):
    try:
        cycle = nx.find_cycle(G)
        raise CurriculumCycleError([u for u, v in cycle])

    except nx.NetworkXNoCycle:
        pass

    missing_metadata = set(G.nodes) - set(catalog)

    if missing_metadata:
        raise ValueError(
            f"Missing course metadata: {missing_metadata}"
        )

 # 3. Iterative Semester Scheduling
def generate_candidates(G, remaining, scheduled):
    eligible = []

    for unit in remaining:
        prereqs = G.predecessors(unit)

        # Enforce prerequisite rules, all([]) within python also cover vacant cases
        if all(p in scheduled for p in prereqs):
            eligible.append(unit)

    return eligible

# Rule 2: Rank by unlocked descendants / Rule 3: Tie-breaker by alphabetical code
def rank_candidates(G, candidates, remaining):
    scores = {
        u: len(nx.descendants(G, u) & remaining)
        for u in candidates
    }

    ranked = sorted(
        candidates,
        key=lambda u: (-scores[u], u)
    )

    return ranked, scores

# Rule 4: Max 3 units per semester
def allocate_semester(ranked, catalog, scores, semester_index):
    selected = ranked[:3]

    units = []

    for rank, unit in enumerate(selected, start=1):
        details = catalog[unit]
        score = scores[unit]

        reason = (
            f"has {score} remaining downstream units"
            if score > 0
            else "no remaining downstream dependencies"
        )

        units.append({
            "code": unit,
            "name": details["name"],
            "credit_points": details["credit_points"],
            "rank": rank,
            "reason": reason
        })

    return {
        "index": semester_index,
        "name": f"Semester {semester_index}",
        "credit_points": sum(
            catalog[u]["credit_points"] for u in selected
        ),
        "units": units
    }, selected

# coverage for potential deadlock of remaining missing candidates
def get_blocked_units(G, remaining, scheduled, catalog):
    blocked = []

    for unit in sorted(remaining):
        missing = [
            p for p in G.predecessors(unit)
            if p not in scheduled
        ]

        details = catalog[unit]

        blocked.append({
            "code": unit,
            "name": details["name"],
            "credit_points": details["credit_points"],
            "missing_prereqs": missing,
            "available_after": None
        })

    return blocked

def generate_study_plan(
    major_id: str,
    completed_codes: List[str]
) -> Dict[str, Any]:

    db = SessionLocal()

    try:
        # 1. Load data
        G, catalog, major_curriculum = load_curriculum(
            db, major_id
        )

        # 2. Validate curriculum
        validate_curriculum(G, catalog)

        completed = set(completed_codes)

        if not completed.issubset(catalog):
            raise ValueError("Unknown completed course codes")

        remaining = major_curriculum - completed
        scheduled = completed.copy()

        semesters = []
        semester_index = 1

        # 3. Iterative scheduling
        while remaining:

            # Candidate generation
            candidates = generate_candidates(
                G, remaining, scheduled
            )

            if not candidates:
                break

            # Ranking
            ranked, scores = rank_candidates(
                G, candidates, remaining
            )

            # Allocation
            semester, selected = allocate_semester(
                ranked, catalog, scores, semester_index
            )

            semesters.append(semester)

            # Update state
            scheduled.update(selected)
            remaining.difference_update(selected)

            semester_index += 1

        # 4. Reporting
        blocked = get_blocked_units(
            G, remaining, scheduled, catalog
        )

        return {
            "major": {
                "id": major_id,
                "name": "Artificial Intelligence"
            },
            "semesters": semesters,
            "blocked_units": blocked,
            "violations": 0,
            "completed_units": completed_codes
        }

    finally:
        db.close()