import os
import re
import time
import requests
from sentence_transformers import SentenceTransformer
from sqlalchemy import select

from service.models import SessionLocal, SyllabusChunk, Student, Prerequisite, Course
from service.recommender import generate_study_plan

MAX_DISTANCE_THRESHOLD = 1.6
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:3b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"

# Lazy-loaded singleton embedder so FastAPI startup stays fast
_embedder: SentenceTransformer | None = None


def _get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer(EMBED_MODEL_NAME)
    return _embedder


def _detect_query_intent(question: str) -> tuple[str, list[str] | None]:
    """
    Distinguishes passing/assessment hurdle questions from prerequisite questions
    to prevent retrieval confusion.
    """
    q_lower = question.lower()
    passing_keywords = ("pass", "hurdle", "fail", "assessment", "exam", "grade", "weight", "mark")
    prereq_keywords = ("prerequisite", "prereq", "enrol", "eligible", "before taking", "unlock")

    if any(k in q_lower for k in passing_keywords):
        return (
            f"{question} assessment weighting exam hurdle passing requirements",
            ["assessments", "hurdles", "summary"],
        )
    if any(k in q_lower for k in prereq_keywords):
        return (
            f"{question} enrolment prerequisites assumed knowledge",
            ["prerequisites", "summary"],
        )
    return question, None


def _build_student_context(db, student_id: int | None, target_unit: str | None) -> str:
    """
    Fetches Current Student academic progress from PostgreSQL so answers
    reflect passed/failed units and prerequisite eligibility.
    """
    if student_id is None:
        return ""

    student = db.execute(select(Student).where(Student.student_id == student_id)).scalar_one_or_none()
    if not student:
        return ""

    passed = set(student.passed_units or [])
    failed = set(student.failed_units or [])
    enrolled = set(student.enrolled_units or [])
    lines = [
        f"Student Profile (ID {student.student_id}):",
        f"- Major: {student.major_code or 'Undeclared'} | Career Goal: {student.target_career or 'Not set'}",
        f"- Passed Units: {', '.join(sorted(passed)) if passed else 'None'}",
        f"- Currently Enrolled Units: {', '.join(sorted(enrolled)) if enrolled else 'None'}",
        f"- Failed Units (Need Retake): {', '.join(sorted(failed)) if failed else 'None'}",
    ]

    if target_unit:
        prereq_rows = db.execute(
            select(Prerequisite).where(Prerequisite.dependent_code == target_unit)
        ).scalars().all()
        if prereq_rows:
            status_notes = []
            for p in prereq_rows:
                if p.prerequisite_code in passed:
                    met = "MET"
                elif p.prerequisite_code in enrolled:
                    met = "IN PROGRESS (ENROLLED)"
                else:
                    met = "NOT MET"
                status_notes.append(f"{p.prerequisite_code} ({p.rule_type}: {met})")
            lines.append(f"- Prerequisite Check for {target_unit}: {', '.join(status_notes)}")

    try:
        plan = generate_study_plan(
            major_id=student.major_code or "artificial-intelligence",
            completed_codes=sorted(passed),
            failed_codes=sorted(failed),
            enrolled_codes=sorted(enrolled),
        )
        semesters = plan.get("semesters") or []
        if semesters:
            next_sem = semesters[0]
            rec_units = []
            for u in next_sem.get("units", []):
                tag = " [RETAKE REQUIRED]" if u.get("is_retake") else ""
                rec_units.append(f"{u['code']} ({u['name']}){tag} — {u.get('reason', '')}")
            lines.append(f"- Next Recommended Semester ({next_sem.get('name', 'Semester 1')}): {'; '.join(rec_units)}")
        else:
            lines.append("- Next Recommended Semester: None (all major units completed or enrolled)")
    except Exception:
        pass

    return "\n".join(lines)


def _validate_and_clean_answer(answer: str, valid_codes: set[str]) -> str:
    """
    Post-generation closed-world validator: strips any hallucinated course-code-like
    tokens (e.g. COSC10006, ENGR10007) not present in the PostgreSQL courses table
    or retrieved syllabus chunks.
    """
    if not answer or not valid_codes:
        return answer

    unverified: list[str] = []

    def _replace(match: re.Match) -> str:
        code = match.group(1)
        if code in valid_codes:
            return code
        if code not in unverified:
            unverified.append(code)
        return "[unverified unit removed]"

    cleaned = re.sub(r"\b([A-Z]{3,4}\d{4,5})\b", _replace, answer)
    if unverified:
        cleaned += (
            "\n\n> Note: Unverified unit code(s) not present in the curriculum database "
            "were removed from this response."
        )
    return cleaned


def _build_curriculum_context(db) -> str:
    """
    Fetches the authoritative course catalog and prerequisite DAG from PostgreSQL
    so prerequisite explanations and Mermaid diagrams never invent or copy unverified unit codes.
    """
    courses = db.execute(select(Course).order_by(Course.code)).scalars().all()
    prereqs = db.execute(
        select(Prerequisite).order_by(Prerequisite.dependent_code, Prerequisite.prerequisite_code)
    ).scalars().all()

    course_lines = [f"- {c.code}: {c.name}" for c in courses]
    edge_lines = [f"- {p.prerequisite_code} -> {p.dependent_code} ({p.rule_type})" for p in prereqs]

    return (
        "Verified Course Catalog:\n"
        + ("\n".join(course_lines) if course_lines else "- None")
        + "\n\nVerified Prerequisite Edges (prerequisite_code -> dependent_code):\n"
        + ("\n".join(edge_lines) if edge_lines else "- None")
    )


def get_chat_response(
    question: str,
    history: list | None = None,
    student_id: int | None = None,
) -> dict:
    start_time = time.time()

    # 1. Extract unit code from the question if present (e.g., COS30018, SWE30003, TNE10006)
    unit_code_match = re.search(r"[A-Za-z]{3}\d{5}", question, re.IGNORECASE)
    target_unit = unit_code_match.group(0).upper() if unit_code_match else None

    expanded_query, preferred_sections = _detect_query_intent(question)
    query_vec = _get_embedder().encode(expanded_query).tolist()

    db = SessionLocal()
    try:
        distance_col = SyllabusChunk.embedding.l2_distance(query_vec).label("distance")
        stmt = select(SyllabusChunk, distance_col)

        if target_unit:
            stmt = stmt.where(SyllabusChunk.course_code == target_unit)
        if preferred_sections:
            stmt = stmt.where(SyllabusChunk.section.in_(preferred_sections))

        rows = db.execute(stmt.order_by(distance_col).limit(5)).all()

        # Fallback if section-filtered query returned no rows for that unit
        if not rows and target_unit and preferred_sections:
            fallback_stmt = (
                select(SyllabusChunk, distance_col)
                .where(SyllabusChunk.course_code == target_unit)
                .order_by(distance_col)
                .limit(5)
            )
            rows = db.execute(fallback_stmt).all()

        if not rows:
            return {
                "answer": f"I could not find any syllabus records matching unit code {target_unit or ''}.",
                "citations": [],
                "abstained": True,
                "abstain_reason": "UNIT_NOT_FOUND",
                "top_similarity": 999.0,
                "threshold": MAX_DISTANCE_THRESHOLD,
                "sources_checked": 0,
                "sources_passed": 0,
                "latency_ms": int((time.time() - start_time) * 1000),
            }

        distances = [float(dist) for _, dist in rows]
        best_match_distance = min(distances)

        if best_match_distance > MAX_DISTANCE_THRESHOLD:
            return {
                "answer": None,
                "citations": [],
                "abstained": True,
                "abstain_reason": "LOW_SIMILARITY",
                "top_similarity": round(best_match_distance, 2),
                "threshold": MAX_DISTANCE_THRESHOLD,
                "sources_checked": len(distances),
                "sources_passed": 0,
                "latency_ms": int((time.time() - start_time) * 1000),
            }

        citations = []
        context_chunks = []

        for chunk, dist in rows:
            dist_val = float(dist)
            if dist_val <= MAX_DISTANCE_THRESHOLD:
                context_chunks.append(chunk.content)
                citations.append(
                    {
                        "source_file": f"{chunk.course_code} ({chunk.section})",
                        "text_snippet": chunk.content,
                        "similarity_score": round(dist_val, 2),
                    }
                )

        student_context = _build_student_context(db, student_id, target_unit)
        curriculum_context = _build_curriculum_context(db)
        valid_codes = {c.upper() for c in db.execute(select(Course.code)).scalars().all()}
        valid_codes.update(c.course_code.upper() for c, _ in rows if c.course_code)
    finally:
        db.close()

    context_prompt = "\n\n".join(context_chunks)
    student_block = f"\n\nStudent Academic Record:\n{student_context}" if student_context else ""
    curriculum_block = f"\n\nVerified Curriculum & Prerequisite Graph:\n{curriculum_context}"

    full_prompt = (
        f"Answer the student's question using the official unit outline and verified curriculum graph below."
        f"{curriculum_block}{student_block}\n\n"
        f"Retrieved Syllabus Chunks:\n{context_prompt}\n\n"
        f"Question: {question}"
    )

    try:
        llm_response = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": LLM_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a helpful academic advisor speaking directly to university students. "
                            "You MUST ONLY mention unit codes and exact unit titles that appear in the "
                            "Verified Course Catalog or Retrieved Syllabus Chunks below. "
                            "Do NOT invent course codes (such as COSC10006 or COSC20007), do NOT alter unit names, "
                            "and do NOT fabricate contact hours, assessment breakdowns, or prerequisites not explicitly "
                            "stated in the retrieved chunks. "
                            "NEVER mention 'JSON', 'JSON structure', 'database', 'pgvector', 'context', or 'provided text'—"
                            "refer to it naturally as 'the unit outline' or 'the syllabus'. "
                            "Do not confuse enrolment prerequisites with passing/assessment hurdles. "
                            "When the student asks which units to enroll in this semester, directly recommend the units "
                            "from their Next Recommended Semester in the Student Academic Record (prioritizing any "
                            "RETAKE REQUIRED units first) and NEVER recommend units already in Passed Units or "
                            "Currently Enrolled Units. "
                            "When explaining prerequisites or generating ```mermaid``` flowchart diagrams, ONLY use course codes "
                            "and edges that exist in the Verified Curriculum & Prerequisite Graph or the Student Academic Record. "
                            "NEVER include external or alternative unit codes mentioned in passing inside syllabus prose "
                            "(such as ENGR10007) if they do not exist in the Verified Curriculum & Prerequisite Graph. "
                            "Label Mermaid nodes cleanly using verified course codes and names "
                            "(e.g., COS10009[\"COS10009: Introduction to Programming\"]). "
                            "When presenting assessments, unit comparisons, or study steps, include a clean Markdown table. "
                            "When explaining prerequisite chains, include a compact ```mermaid graph TD``` diagram."
                        ),
                    },
                    {
                        "role": "user",
                        "content": full_prompt,
                    },
                ],
                "stream": False,
            },
            timeout=60,
        )
        raw_answer = llm_response.json().get("message", {}).get("content", "Error reading LLM response.")
        llm_answer = _validate_and_clean_answer(raw_answer, valid_codes)
    except Exception as e:
        llm_answer = f"LLM connection failed. Error: {str(e)}"

    return {
        "answer": llm_answer,
        "citations": citations,
        "abstained": False,
        "abstain_reason": None,
        "top_similarity": round(best_match_distance, 2),
        "threshold": MAX_DISTANCE_THRESHOLD,
        "sources_checked": len(distances),
        "sources_passed": len(citations),
        "latency_ms": int((time.time() - start_time) * 1000),
    }
