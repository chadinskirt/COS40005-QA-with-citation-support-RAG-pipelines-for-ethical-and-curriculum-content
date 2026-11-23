import os
import re
import time
import requests
from sentence_transformers import SentenceTransformer
from sqlalchemy import select

from service.models import SessionLocal, SyllabusChunk, Student, Prerequisite

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
    lines = [
        f"Student Profile (ID {student.student_id}):",
        f"- Major: {student.major_code or 'Undeclared'} | Career Goal: {student.target_career or 'Not set'}",
        f"- Passed Units: {', '.join(sorted(passed)) if passed else 'None'}",
        f"- Failed Units (Need Retake): {', '.join(sorted(failed)) if failed else 'None'}",
    ]

    if target_unit:
        prereq_rows = db.execute(
            select(Prerequisite).where(Prerequisite.dependent_code == target_unit)
        ).scalars().all()
        if prereq_rows:
            status_notes = []
            for p in prereq_rows:
                met = "MET" if p.prerequisite_code in passed else "NOT MET"
                status_notes.append(f"{p.prerequisite_code} ({p.rule_type}: {met})")
            lines.append(f"- Prerequisite Check for {target_unit}: {', '.join(status_notes)}")

    return "\n".join(lines)


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
    finally:
        db.close()

    context_prompt = "\n\n".join(context_chunks)
    student_block = f"\n\nStudent Academic Record:\n{student_context}" if student_context else ""

    full_prompt = (
        f"Answer the student's question using the official unit outline below.{student_block}\n\n"
        f"Unit Outline:\n{context_prompt}\n\n"
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
                            "Answer using ONLY the provided Unit Outline and Student Academic Record. "
                            "NEVER mention 'JSON', 'JSON structure', 'database', 'pgvector', 'context', or 'provided text'—"
                            "refer to it naturally as 'the unit outline' or 'the syllabus'. "
                            "Do not confuse enrolment prerequisites with passing/assessment hurdles. "
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
        llm_answer = llm_response.json().get("message", {}).get("content", "Error reading LLM response.")
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
