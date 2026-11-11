import networkx as nx
from typing import List, Dict, Any
from models import SessionLocal, Course, Prerequisite

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

def generate_study_plan(major_id: str, completed_codes: List[str]) -> Dict[str, Any]:
    db = SessionLocal()
    try:
        # 1. Fetch live data from PostgreSQL
        G = build_curriculum_graph(db)
        
        all_courses = db.query(Course).all()
        catalog = {c.code: {"name": c.name, "credit_points": c.credit_points} for c in all_courses}
        
        # In a full app, this would filter by the major_id mapping. 
        # For now, we schedule all courses in the database.
        major_curriculum = list(catalog.keys())
        
        # 2. Cycle Detection (Risk 4 mitigation)
        try:
            cycle = nx.find_cycle(G)
            raise CurriculumCycleError([u for u, v in cycle])
        except nx.NetworkXNoCycle:
            pass

        completed_set = set(completed_codes)
        remaining_units = set(major_curriculum) - completed_set
        scheduled_units = set(completed_codes)
        
        semesters = []
        blocked_units = []
        semester_index = 1
        
        # 3. Iterative Semester Scheduling
        while remaining_units:
            eligible = []
            
            for unit in remaining_units:
                # If a course has no prerequisites, it's immediately eligible
                if unit not in G.nodes or not list(G.predecessors(unit)):
                    eligible.append(unit)
                    continue
                    
                prereqs = list(G.predecessors(unit))
                
                # Enforce prerequisite rules
                if all(p in scheduled_units for p in prereqs):
                    eligible.append(unit)
                    
            if not eligible:
                for unit in remaining_units:
                    if unit in G.nodes:
                        missing = [p for p in G.predecessors(unit) if p not in scheduled_units]
                        details = catalog.get(unit, {"name": "Unknown", "credit_points": 12.5})
                        blocked_units.append({
                            "code": unit,
                            "name": details["name"],
                            "credit_points": details["credit_points"],
                            "missing_prereqs": missing,
                            "available_after": None
                        })
                break
                
            # Rule 2: Rank by unlocked descendants / Rule 3: Tie-breaker by alphabetical code
            def get_rank_score(u):
                if u in G.nodes:
                    descendants = nx.descendants(G, u)
                    return len(descendants.intersection(remaining_units))
                return 0
                
            eligible.sort(key=lambda u: (-get_rank_score(u), u))
            
            # Rule 4: Max 3 units per semester
            selected_for_semester = eligible[:3]
            
            semester_payload = {
                "index": semester_index,
                "name": f"Semester {semester_index}",
                "credit_points": sum(catalog[u]["credit_points"] for u in selected_for_semester),
                "units": []
            }
            
            for rank, unit in enumerate(selected_for_semester, start=1):
                details = catalog.get(unit, {"name": "Unknown", "credit_points": 12.5})
                unlocked_count = get_rank_score(unit)
                reason = f"unlocks {unlocked_count} later units" if unlocked_count > 0 else "required for your major"
                
                semester_payload["units"].append({
                    "code": unit,
                    "name": details["name"],
                    "credit_points": details["credit_points"],
                    "rank": rank,
                    "reason": reason
                })
                
                scheduled_units.add(unit)
                remaining_units.remove(unit)
                
            semesters.append(semester_payload)
            semester_index += 1

        return {
            "major": {"id": major_id, "name": "Artificial Intelligence"},
            "semesters": semesters,
            "blocked_units": blocked_units,
            "violations": 0,
            "completed_units": completed_codes
        }
    finally:
        db.close()