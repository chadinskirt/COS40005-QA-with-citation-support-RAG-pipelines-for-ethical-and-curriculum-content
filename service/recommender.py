import networkx as nx
from typing import List, Dict, Any, Optional, Set
from service.models import SessionLocal, Course, Prerequisite, CatalogueMapping


class CurriculumCycleError(Exception):
    def __init__(self, cycle_nodes):
        self.cycle_nodes = cycle_nodes


CANONICAL_MAJORS = [
    {"id": "artificial-intelligence", "name": "Artificial Intelligence"},
    {"id": "data-science", "name": "Data Science"},
    {"id": "software-development", "name": "Software Development"},
    {"id": "internet-of-things", "name": "Internet of Things"},
    {"id": "cyber-security", "name": "Cybersecurity"},
]

MAJOR_DISPLAY_NAMES = {m["id"]: m["name"] for m in CANONICAL_MAJORS}

MAJOR_TO_CATALOGUE_IDS = {
    "artificial-intelligence": ["CS_AI", "CS_AI_ENGINEERING", "CS_PROGRAMMING"],
    "data-science": ["CS_DATA_SCIENCE", "CS_PROGRAMMING"],
    "software-development": ["CS_SOFTWARE_ARCH", "CS_CLOUD", "CS_PROGRAMMING"],
    "internet-of-things": ["CS_NETWORK", "CS_CLOUD", "CS_PROGRAMMING"],
    "cyber-security": ["CS_NETWORK", "CS_PROGRAMMING"],
    "cybersecurity": ["CS_NETWORK", "CS_PROGRAMMING"],
}

CS_CORE_CODES = {
    "COS10004",
    "COS10009",
    "COS10025",
    "COS10026",
    "TNE10006",
    "COS20007",
    "COS40005",
    "COS40006",
}

MAJOR_UNIT_CODES = {
    "artificial-intelligence": {
        "COS20019",
        "COS20031",
        "COS30018",
        "COS30019",
        "COS30049",
        "COS30082",
        "SWE30003",
        "COS40007",
    },
    "mj-aiv": {
        "COS20019",
        "COS20031",
        "COS30018",
        "COS30019",
        "COS30049",
        "COS30082",
        "SWE30003",
        "COS40007",
    },
    "data-science": {"COS10022", "COS30082"},
    "software-development": {"SWE20004", "COS20019", "SWE30003"},
    "internet-of-things": {"TNE10006", "TNE30009", "COS20019"},
    "cyber-security": {"TNE10006", "TNE10003", "TNE30009"},
    "cybersecurity": {"TNE10006", "TNE10003", "TNE30009"},
}

ELECTIVE_UNIT_CODES = {
    "LAW20019",
    "COS40003",
    "MDA10018",
    "STA10003",
    "COS10022",
    "MTH10013",
}


def build_curriculum_graph(db) -> nx.DiGraph:
    """Builds the prerequisite DAG dynamically from the PostgreSQL database."""
    G = nx.DiGraph()
    prereqs = db.query(Prerequisite).all()
    for p in prereqs:
        G.add_edge(p.prerequisite_code, p.dependent_code, rule_type=p.rule_type)
    return G


# 1. Fetch live data from PostgreSQL and build DAG
def load_curriculum(db, major_id: str):
    """Builds the prerequisite DAG and filters curriculum units by major_id."""
    G = build_curriculum_graph(db)

    all_courses = db.query(Course).all()
    catalog = {
        c.code: {
            "name": c.name,
            "credit_points": c.credit_points,
        }
        for c in all_courses
    }

    # Ensure standalone courses without prerequisite edges exist as nodes in the graph
    G.add_nodes_from(catalog.keys())

    # Filter using Core + Major + Elective + CatalogueMapping (strictly closed-world against seeded catalog)
    catalogue_ids = MAJOR_TO_CATALOGUE_IDS.get(major_id, [major_id])
    mapped_rows = (
        db.query(CatalogueMapping)
        .filter(CatalogueMapping.catalogue_id.in_(catalogue_ids))
        .all()
    )
    major_key = major_id.lower() if isinstance(major_id, str) else major_id
    explicit_major = MAJOR_UNIT_CODES.get(major_key, set())
    mapped_codes = {row.course_code for row in mapped_rows if row.course_code in catalog}

    if explicit_major or mapped_codes:
        major_curriculum = (CS_CORE_CODES | explicit_major | mapped_codes | ELECTIVE_UNIT_CODES) & set(catalog.keys())
        # Include any upstream prerequisites required to unlock units in this curriculum
        ancestors: Set[str] = set()
        for unit in major_curriculum:
            if unit in G:
                ancestors.update(nx.ancestors(G, unit))
        major_curriculum.update(ancestors & set(catalog.keys()))
    else:
        major_curriculum = set(catalog.keys())

    return G, catalog, major_curriculum


# 2. Cycle Detection (Risk 4 mitigation)
def validate_curriculum(G: nx.DiGraph, catalog: Dict[str, Any]):
    try:
        cycle = nx.find_cycle(G)
        raise CurriculumCycleError([u for u, v in cycle])
    except nx.NetworkXNoCycle:
        pass

    missing_metadata = set(G.nodes) - set(catalog)
    if missing_metadata:
        raise ValueError(f"Missing course metadata: {missing_metadata}")


# 3. Iterative Semester Scheduling (supports AND, OR, and ASSUMED rules)
def generate_candidates(G: nx.DiGraph, remaining: Set[str], scheduled: Set[str]) -> List[str]:
    eligible = []

    for unit in remaining:
        prereqs = list(G.predecessors(unit))
        if not prereqs:
            eligible.append(unit)
            continue

        and_prereqs = [
            p for p in prereqs
            if (G[p][unit].get("rule_type") or "AND").upper() == "AND"
        ]
        or_prereqs = [
            p for p in prereqs
            if (G[p][unit].get("rule_type") or "AND").upper() == "OR"
        ]

        and_ok = all(p in scheduled for p in and_prereqs)
        or_ok = any(p in scheduled for p in or_prereqs) if or_prereqs else True

        if and_ok and or_ok:
            eligible.append(unit)

    return eligible


# Rule 1: Priority retakes (failed units) -> Rule 2: Unlocked descendants -> Rule 3: Alphabetical code
def rank_candidates(
    G: nx.DiGraph,
    candidates: List[str],
    remaining: Set[str],
    failed_set: Optional[Set[str]] = None,
):
    failed_set = failed_set or set()
    scores = {
        u: len(nx.descendants(G, u) & remaining)
        for u in candidates
    }

    ranked = sorted(
        candidates,
        key=lambda u: (0 if u in failed_set else 1, -scores[u], u),
    )

    return ranked, scores


# Rule 4: Allocate up to max_units_per_semester (default 3)
def allocate_semester(
    ranked: List[str],
    catalog: Dict[str, Any],
    scores: Dict[str, int],
    semester_index: int,
    max_units: int = 3,
    failed_set: Optional[Set[str]] = None,
):
    failed_set = failed_set or set()
    selected = ranked[:max_units]
    units = []

    for rank, unit in enumerate(selected, start=1):
        details = catalog[unit]
        score = scores[unit]
        is_retake = unit in failed_set

        if is_retake:
            reason = (
                f"mandatory retake (unlocks {score} downstream units)"
                if score > 0
                else "mandatory retake of previously failed unit"
            )
        else:
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
            "is_retake": is_retake,
            "status": "Retake Required" if is_retake else "Planned",
            "reason": reason,
        })

    return {
        "index": semester_index,
        "name": f"Semester {semester_index}",
        "credit_points": sum(catalog[u]["credit_points"] for u in selected),
        "units": units,
    }, selected


# Coverage for potential deadlock of remaining missing candidates
def get_blocked_units(
    G: nx.DiGraph,
    remaining: Set[str],
    scheduled: Set[str],
    catalog: Dict[str, Any],
):
    blocked = []

    for unit in sorted(remaining):
        prereqs = list(G.predecessors(unit))
        and_missing = [
            p for p in prereqs
            if (G[p][unit].get("rule_type") or "AND").upper() == "AND" and p not in scheduled
        ]
        or_prereqs = [
            p for p in prereqs
            if (G[p][unit].get("rule_type") or "AND").upper() == "OR"
        ]
        or_missing = or_prereqs if (or_prereqs and not any(p in scheduled for p in or_prereqs)) else []

        missing = and_missing + or_missing
        details = catalog[unit]

        blocked.append({
            "code": unit,
            "name": details["name"],
            "credit_points": details["credit_points"],
            "missing_prereqs": missing,
            "available_after": None,
        })

    return blocked


def _serialize_dag_graph(
    G: nx.DiGraph,
    major_curriculum: Set[str],
    catalog: Dict[str, Any],
    passed_set: Set[str],
    enrolled_set: Set[str],
    failed_set: Set[str],
    blocked_codes: Set[str],
) -> Dict[str, Any]:
    """Exports nodes and edges for the student's active curriculum DAG visualization."""
    relevant_nodes = sorted(major_curriculum | passed_set | enrolled_set | failed_set)
    nodes = []
    for code in relevant_nodes:
        if code in passed_set:
            node_status = "passed"
        elif code in enrolled_set:
            node_status = "enrolled"
        elif code in failed_set:
            node_status = "retake"
        elif code in blocked_codes:
            node_status = "blocked"
        else:
            node_status = "planned"

        nodes.append({
            "id": code,
            "label": f"{code}: {catalog.get(code, {}).get('name', code)}",
            "status": node_status,
        })

    node_set = set(relevant_nodes)
    edges = [
        {
            "source": u,
            "target": v,
            "rule_type": (data.get("rule_type") or "AND").upper(),
        }
        for u, v, data in G.edges(data=True)
        if u in node_set and v in node_set
    ]
    return {"nodes": nodes, "edges": edges}


def generate_study_plan(
    major_id: str,
    completed_codes: List[str],
    failed_codes: Optional[List[str]] = None,
    enrolled_codes: Optional[List[str]] = None,
    units_per_semester: int = 3,
) -> Dict[str, Any]:
    db = SessionLocal()

    try:
        # 1. Load data
        G, catalog, major_curriculum = load_curriculum(db, major_id)

        # 2. Validate curriculum
        validate_curriculum(G, catalog)

        normalized_completed = list(dict.fromkeys(c.strip().upper() for c in completed_codes if c.strip()))
        completed = set(normalized_completed)

        if not completed.issubset(catalog):
            unknown = sorted(completed - set(catalog.keys()))
            raise ValueError(f"Unknown completed course codes: {unknown}")

        normalized_failed = [
            c.strip().upper()
            for c in (failed_codes or [])
            if c.strip() and c.strip().upper() in catalog and c.strip().upper() not in completed
        ]
        failed_set = set(normalized_failed)

        normalized_enrolled = [
            c.strip().upper()
            for c in (enrolled_codes or [])
            if c.strip() and c.strip().upper() in catalog and c.strip().upper() not in completed
        ]
        enrolled_set = set(normalized_enrolled)

        # Both passed and currently enrolled units satisfy prerequisites for upcoming semesters
        already_satisfied = completed | enrolled_set
        remaining = (major_curriculum | failed_set) - already_satisfied
        scheduled = already_satisfied.copy()

        semesters = []
        semester_index = 1

        # 3. Iterative scheduling
        while remaining:
            candidates = generate_candidates(G, remaining, scheduled)
            if not candidates:
                break

            ranked, scores = rank_candidates(G, candidates, remaining, failed_set=failed_set)
            semester, selected = allocate_semester(
                ranked,
                catalog,
                scores,
                semester_index,
                max_units=max(1, units_per_semester),
                failed_set=failed_set,
            )

            semesters.append(semester)
            scheduled.update(selected)
            remaining.difference_update(selected)
            semester_index += 1

        # 4. Reporting
        blocked = get_blocked_units(G, remaining, scheduled, catalog)
        blocked_codes = {b["code"] for b in blocked}
        display_name = MAJOR_DISPLAY_NAMES.get(major_id, major_id.replace("-", " ").title())

        return {
            "major": {
                "id": major_id,
                "name": display_name,
            },
            "semesters": semesters,
            "blocked_units": blocked,
            "violations": 0,
            "completed_units": normalized_completed,
            "failed_units": normalized_failed,
            "enrolled_units": normalized_enrolled,
            "dag_graph": _serialize_dag_graph(
                G=G,
                major_curriculum=major_curriculum,
                catalog=catalog,
                passed_set=completed,
                enrolled_set=enrolled_set,
                failed_set=failed_set,
                blocked_codes=blocked_codes,
            ),
        }

    finally:
        db.close()
