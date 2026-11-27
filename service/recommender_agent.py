import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from sqlalchemy import select

from service.models import Course, Prerequisite, Student, SyllabusChunk
from service.recommender import generate_study_plan, get_ingested_unit_codes


def get_archive_dir() -> Path:
    """Returns the approved syllabus archive root directory."""
    env_dir = os.getenv("ARCHIVE_DIR")
    if env_dir:
        return Path(env_dir)
    repo_root = Path(__file__).resolve().parent.parent
    for candidate in (repo_root / "doc" / "Archive", repo_root / "doc" / "archive"):
        if candidate.is_dir():
            return candidate
    return repo_root / "doc" / "Archive"


def find_archive_document(unit_code: str, archive_dir: Optional[Path] = None) -> Optional[str]:
    """Finds the relative filename in ARCHIVE_DIR matching unit_code, or None if missing."""
    code = (unit_code or "").strip().upper()
    if not code:
        return None
    root = archive_dir or get_archive_dir()
    if not root.is_dir():
        return None
    for entry in sorted(root.iterdir()):
        if entry.is_file() and entry.suffix.lower() in {".pdf", ".md", ".txt"}:
            if code in entry.name.upper():
                return entry.name
    return None


def build_document_url(source_file: Optional[str]) -> Optional[str]:
    if not source_file:
        return None
    return f"/api/documents/{quote(source_file)}"

RECOMMEND_KEYWORDS = (
    "recommend",
    "this semester",
    "next semester",
    "next unit",
    "eligible",
    "retake",
    "enroll",
    "enrol",
    "study plan",
    "what units",
    "which units",
    "take next",
)

PREFERRED_SECTION_ORDER = {
    "overview": 0,
    "summary": 1,
    "aims": 2,
    "assessments": 3,
    "hurdles": 4,
    "contact_hours": 5,
    "topics": 6,
    "prerequisites": 7,
}

AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "tool_get_current_semester_recommendations",
            "description": (
                "Get the student's academic profile and current-semester recommended units "
                "(prioritizing mandatory retakes) from PostgreSQL and the prerequisite DAG."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "student_id": {"type": ["integer", "null"], "description": "Numeric Student ID if known."},
                    "major_code": {"type": ["string", "null"], "description": "Canonical major ID."},
                    "units_per_semester": {"type": "integer", "default": 4},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "tool_lookup_unit_syllabus",
            "description": (
                "Look up official course metadata, prerequisites, and syllabus sections "
                "(overview, assessments, contact_hours, topics) for a specific unit code."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "unit_code": {"type": "string", "description": "Exact Swinburne unit code, e.g. COS30082."},
                    "top_k": {"type": "integer", "default": 6},
                },
                "required": ["unit_code"],
            },
        },
    },
]


def detect_tool_intents(
    question: str,
    student_id: Optional[int] = None,
    major_code: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Deterministic fallback intent/entity detector for reliable tool execution on small models."""
    calls: List[Dict[str, Any]] = []
    q_lower = (question or "").lower()

    if any(kw in q_lower for kw in RECOMMEND_KEYWORDS):
        calls.append(
            {
                "name": "tool_get_current_semester_recommendations",
                "arguments": {
                    "student_id": student_id,
                    "major_code": major_code,
                    "units_per_semester": 4,
                },
            }
        )

    unit_codes = re.findall(r"\b([A-Za-z]{3}\d{5})\b", question or "")
    seen_codes = set()
    for raw_code in unit_codes:
        code = raw_code.upper()
        if code not in seen_codes:
            seen_codes.add(code)
            calls.append(
                {
                    "name": "tool_lookup_unit_syllabus",
                    "arguments": {"unit_code": code, "top_k": 6},
                }
            )

    return calls


def tool_get_current_semester_recommendations(
    db,
    student_id: Optional[int] = None,
    major_code: Optional[str] = None,
    units_per_semester: int = 4,
) -> Dict[str, Any]:
    """
    Course Recommender Sub-Agent tool: loads student history (if student_id exists),
    runs the prerequisite-aware DAG planner for the current semester, and returns structured JSON.
    """
    passed: List[str] = []
    failed: List[str] = []
    enrolled: List[str] = []
    resolved_major = major_code or "artificial-intelligence"
    resolved_student_id: Optional[int] = None

    if student_id is not None:
        student = db.execute(select(Student).where(Student.student_id == student_id)).scalar_one_or_none()
        if student:
            resolved_student_id = student.student_id
            resolved_major = major_code or student.major_code or resolved_major
            passed = list(student.passed_units or [])
            failed = list(student.failed_units or [])
            enrolled = list(student.enrolled_units or [])

    plan = generate_study_plan(
        major_id=resolved_major,
        completed_codes=passed,
        failed_codes=failed,
        enrolled_codes=enrolled,
        units_per_semester=units_per_semester,
    )

    semesters = plan.get("semesters") or []
    rec_units_raw = semesters[0].get("units", []) if semesters else []
    rec_codes = [u["code"] for u in rec_units_raw]

    prereqs_by_unit: Dict[str, List[Dict[str, str]]] = {c: [] for c in rec_codes}
    if rec_codes:
        ingested_codes = get_ingested_unit_codes(db)
        prereq_rows = (
            db.execute(select(Prerequisite).where(Prerequisite.dependent_code.in_(rec_codes)))
            .scalars()
            .all()
        )
        for p in prereq_rows:
            if p.prerequisite_code and p.prerequisite_code.upper() in ingested_codes:
                prereqs_by_unit.setdefault(p.dependent_code, []).append(
                    {
                        "code": p.prerequisite_code,
                        "rule_type": (p.rule_type or "AND").upper(),
                    }
                )

    recommendations = [
        {
            "code": u["code"],
            "name": u["name"],
            "credit_points": u["credit_points"],
            "status": "retake" if u.get("is_retake") else "recommended",
            "description": u.get("description", ""),
            "prerequisites": prereqs_by_unit.get(u["code"], []),
        }
        for u in rec_units_raw
    ]

    return {
        "student_profile": {
            "student_id": resolved_student_id,
            "major": plan.get("major", {"id": resolved_major, "name": resolved_major}),
            "passed_units": plan.get("completed_units", passed),
            "enrolled_units": plan.get("enrolled_units", enrolled),
            "failed_units": plan.get("failed_units", failed),
        },
        "current_semester_recommendations": recommendations,
    }


def tool_lookup_unit_syllabus(
    db,
    unit_code: str,
    embedder=None,
    top_k: int = 6,
) -> Dict[str, Any]:
    """
    Syllabus Retriever tool: queries SyllabusChunk rows strictly for units in
    get_ingested_unit_codes(db). Returns found=False if no syllabus chunks exist.
    """
    code = (unit_code or "").strip().upper()
    if not code:
        return {"found": False, "unit_code": "", "unit_name": "", "prerequisites": [], "citations": []}

    ingested_codes = get_ingested_unit_codes(db)
    if code not in ingested_codes:
        return {
            "found": False,
            "unit_code": code,
            "unit_name": code,
            "credit_points": None,
            "prerequisites": [],
            "citations": [],
        }

    course = db.execute(select(Course).where(Course.code == code)).scalar_one_or_none()
    prereq_rows = (
        db.execute(select(Prerequisite).where(Prerequisite.dependent_code == code))
        .scalars()
        .all()
    )
    chunks = (
        db.execute(
            select(SyllabusChunk)
            .where(SyllabusChunk.course_code == code)
            .order_by(SyllabusChunk.chunk_index)
        )
        .scalars()
        .all()
    )

    if not chunks:
        return {
            "found": False,
            "unit_code": code,
            "unit_name": course.name if course else code,
            "credit_points": None,
            "prerequisites": [],
            "citations": [],
        }

    unit_name = course.name if course else code
    sorted_chunks = sorted(
        chunks,
        key=lambda c: (
            PREFERRED_SECTION_ORDER.get((c.section or "").lower(), 99),
            c.chunk_index,
        ),
    )[:top_k]

    archive_file = find_archive_document(code)
    document_url = build_document_url(archive_file)

    citations = []
    for idx, chunk in enumerate(sorted_chunks, start=1):
        source_file = archive_file or f"{code} ({chunk.section})"
        citations.append(
            {
                "id": f"c{idx}",
                "index": idx,
                "unit_code": code,
                "unit_name": unit_name,
                "section": chunk.section,
                "doc": f"{code} Unit Outline",
                "source_file": source_file,
                "document_url": document_url,
                "page_number": None,
                "similarity": 1.0,
                "similarity_score": 1.0,
                "snippet": chunk.content,
                "text_snippet": chunk.content,
                "content": chunk.content,
            }
        )

    prereq_list = [
        {"code": p.prerequisite_code, "rule_type": (p.rule_type or "AND").upper()}
        for p in prereq_rows
        if p.prerequisite_code and p.prerequisite_code.upper() in ingested_codes
    ]
    cp = course.credit_points if course else 12.5

    return {
        "found": True,
        "unit_code": code,
        "unit_name": unit_name,
        "credit_points": cp,
        "prerequisites": prereq_list,
        "citations": citations,
    }
