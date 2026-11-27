import json
import os
import re
import time
import requests
from sentence_transformers import SentenceTransformer
from sqlalchemy import select

from service.models import SessionLocal, SyllabusChunk, Student, Prerequisite, Course
from service.recommender import generate_study_plan, get_ingested_unit_codes
from service.recommender_agent import (
    AGENT_TOOLS,
    build_document_url,
    detect_tool_intents,
    find_archive_document,
    tool_get_current_semester_recommendations,
    tool_lookup_unit_syllabus,
)

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
        ingested_codes = get_ingested_unit_codes(db)
        prereq_rows = db.execute(
            select(Prerequisite).where(Prerequisite.dependent_code == target_unit)
        ).scalars().all()
        prereq_rows = [p for p in prereq_rows if p.prerequisite_code and p.prerequisite_code.upper() in ingested_codes]
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
    Fetches the authoritative syllabi-backed course catalog and prerequisite DAG from PostgreSQL
    so prerequisite explanations and Mermaid diagrams never invent or copy unverified/uningested unit codes.
    """
    ingested_codes = get_ingested_unit_codes(db)
    courses = [
        c for c in db.execute(select(Course).order_by(Course.code)).scalars().all()
        if c.code and c.code.upper() in ingested_codes
    ]
    prereqs = [
        p for p in db.execute(
            select(Prerequisite).order_by(Prerequisite.dependent_code, Prerequisite.prerequisite_code)
        ).scalars().all()
        if p.prerequisite_code and p.dependent_code
        and p.prerequisite_code.upper() in ingested_codes
        and p.dependent_code.upper() in ingested_codes
    ]

    course_lines = [f"- {c.code}: {c.name}" for c in courses]
    edge_lines = [f"- {p.prerequisite_code} -> {p.dependent_code} ({p.rule_type})" for p in prereqs]

    return (
        "Verified Course Catalog:\n"
        + ("\n".join(course_lines) if course_lines else "- None")
        + "\n\nVerified Prerequisite Edges (prerequisite_code -> dependent_code):\n"
        + ("\n".join(edge_lines) if edge_lines else "- None")
    )


def _route_agent_tools(
    question: str,
    student_id: int | None = None,
    major_code: str | None = None,
) -> list[dict]:
    """
    Advising Orchestrator Agent Router:
    Uses deterministic intent/entity detection first, and invokes Ollama tool-calling
    when no deterministic tool matched so small local models remain 100% reliable.
    """
    calls = detect_tool_intents(question, student_id=student_id, major_code=major_code)
    if calls:
        return calls

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": LLM_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are an advising router. Call tools if the user asks for course "
                            "recommendations or a specific unit syllabus; otherwise reply directly."
                        ),
                    },
                    {"role": "user", "content": question},
                ],
                "tools": AGENT_TOOLS,
                "stream": False,
            },
            timeout=15,
        )
        raw_calls = resp.json().get("message", {}).get("tool_calls") or []
        for tc in raw_calls:
            fn = tc.get("function") or {}
            name = fn.get("name")
            args = fn.get("arguments") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}
            if name in ("tool_get_current_semester_recommendations", "tool_lookup_unit_syllabus"):
                calls.append({"name": name, "arguments": args})
    except Exception:
        pass

    return calls


def get_chat_response(
    question: str,
    history: list | None = None,
    student_id: int | None = None,
    major_code: str | None = None,
) -> dict:
    start_time = time.time()

    unit_code_match = re.search(r"[A-Za-z]{3}\d{5}", question, re.IGNORECASE)
    target_unit = unit_code_match.group(0).upper() if unit_code_match else None
    routed_calls = _route_agent_tools(question, student_id=student_id, major_code=major_code)

    expanded_query, preferred_sections = _detect_query_intent(question)
    tool_calls_used: list[str] = []
    rec_payload: dict | None = None
    merged_citations: list[dict] = []
    seen_citation_keys: set[tuple[str, str, str]] = set()
    distances: list[float] = []

    def _add_citation(cit: dict) -> None:
        key = (
            (cit.get("unit_code") or "").upper(),
            (cit.get("section") or "").lower(),
            (cit.get("content") or "").strip(),
        )
        if key in seen_citation_keys:
            return
        seen_citation_keys.add(key)
        idx = len(merged_citations) + 1
        merged_citations.append(
            {
                **cit,
                "id": f"c{idx}",
                "index": idx,
            }
        )

    db = SessionLocal()
    try:
        ingested_codes = get_ingested_unit_codes(db)
        courses = db.execute(select(Course).order_by(Course.code)).scalars().all()
        course_names = {
            c.code.upper(): c.name for c in courses if c.code and c.code.upper() in ingested_codes
        }

        # 1. Execute Sub-Agent Tools
        for call in routed_calls:
            name = call.get("name")
            args = call.get("arguments") or {}
            if name == "tool_get_current_semester_recommendations":
                rec_payload = tool_get_current_semester_recommendations(
                    db,
                    student_id=args.get("student_id") if args.get("student_id") is not None else student_id,
                    major_code=args.get("major_code") or major_code,
                    units_per_semester=int(args.get("units_per_semester") or 4),
                )
                if "Recommender Agent" not in tool_calls_used:
                    tool_calls_used.append("Recommender Agent")
            elif name == "tool_lookup_unit_syllabus":
                code = (args.get("unit_code") or target_unit or "").strip().upper()
                if code:
                    res = tool_lookup_unit_syllabus(
                        db,
                        unit_code=code,
                        embedder=_get_embedder(),
                        top_k=int(args.get("top_k") or 6),
                    )
                    if res.get("found") and "Syllabus Retriever" not in tool_calls_used:
                        tool_calls_used.append("Syllabus Retriever")
                    for cit in res.get("citations") or []:
                        _add_citation(cit)

        # 2. pgvector semantic search (always run if no exact unit citations found yet; skip if target_unit is uningested)
        if not merged_citations and (not target_unit or target_unit in ingested_codes):
            query_vec = _get_embedder().encode(expanded_query).tolist()
            distance_col = SyllabusChunk.embedding.l2_distance(query_vec).label("distance")
            stmt = select(SyllabusChunk, distance_col)

            if target_unit:
                stmt = stmt.where(SyllabusChunk.course_code == target_unit)
            if preferred_sections:
                stmt = stmt.where(SyllabusChunk.section.in_(preferred_sections))

            rows = db.execute(stmt.order_by(distance_col).limit(5)).all()

            if not rows and target_unit and preferred_sections:
                fallback_stmt = (
                    select(SyllabusChunk, distance_col)
                    .where(SyllabusChunk.course_code == target_unit)
                    .order_by(distance_col)
                    .limit(5)
                )
                rows = db.execute(fallback_stmt).all()

            distances = [float(dist) for _, dist in rows]
            for chunk, dist in rows:
                dist_val = float(dist)
                if dist_val <= MAX_DISTANCE_THRESHOLD:
                    unit_code = (chunk.course_code or "").upper()
                    unit_name = course_names.get(unit_code, unit_code)
                    archive_file = find_archive_document(unit_code)
                    _add_citation(
                        {
                            "unit_code": unit_code,
                            "unit_name": unit_name,
                            "section": chunk.section,
                            "doc": f"{unit_code} Unit Outline",
                            "source_file": archive_file or f"{unit_code} ({chunk.section})",
                            "document_url": build_document_url(archive_file),
                            "page_number": None,
                            "similarity": round(dist_val, 2),
                            "similarity_score": round(dist_val, 2),
                            "snippet": chunk.content,
                            "text_snippet": chunk.content,
                            "content": chunk.content,
                        }
                    )
            if merged_citations and "Syllabus Retriever" not in tool_calls_used:
                tool_calls_used.append("Syllabus Retriever")

        # Abstain when BOTH syllabus retrieval AND recommender sub-agent produced zero grounded records
        if not merged_citations and rec_payload is None:
            best_dist = min(distances) if distances else 999.0
            reason = "LOW_SIMILARITY" if distances else "UNIT_NOT_FOUND"
            return {
                "answer": None if distances else f"No syllabus document is available for {target_unit or 'this unit'} yet.",
                "citations": [],
                "tool_calls_used": tool_calls_used,
                "abstained": True,
                "abstain_reason": reason,
                "top_similarity": round(best_dist, 2),
                "threshold": MAX_DISTANCE_THRESHOLD,
                "sources_checked": len(distances),
                "sources_passed": 0,
                "latency_ms": int((time.time() - start_time) * 1000),
            }

        student_context = _build_student_context(db, student_id, target_unit)
        curriculum_context = _build_curriculum_context(db)
        valid_codes = set(ingested_codes)
        valid_codes.update(c.get("unit_code", "").upper() for c in merged_citations if c.get("unit_code"))
        if rec_payload:
            valid_codes.update(
                u["code"].upper() for u in rec_payload.get("current_semester_recommendations", []) if u.get("code")
            )
    finally:
        db.close()

    context_chunks = [
        f"[Citation {c['index']}] Unit: {c['unit_code']} ({c['unit_name']}) | Section: {c['section']}\n{c['content']}"
        for c in merged_citations
    ]
    context_prompt = "\n\n".join(context_chunks) if context_chunks else "No syllabus chunks retrieved."
    student_block = f"\n\nStudent Academic Record:\n{student_context}" if student_context else ""
    recommender_block = (
        "\n\nCourse Recommender Sub-Agent Output (authoritative JSON — do NOT invent or override these units):\n"
        + json.dumps(rec_payload, indent=2)
        if rec_payload
        else ""
    )
    curriculum_block = f"\n\nVerified Curriculum & Prerequisite Graph:\n{curriculum_context}"

    full_prompt = (
        "Answer the student's question using the Course Recommender Sub-Agent output, official unit outlines, "
        "and verified curriculum graph below."
        f"{curriculum_block}{student_block}{recommender_block}\n\n"
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
                            "You are an Academic Advising Orchestrator speaking directly to university students. "
                            "You MUST ONLY reference or list unit codes present in the provided [Citation N] chunks, "
                            "Course Recommender Sub-Agent Output, or Verified Course Catalog below. "
                            "Omit or strip any uningested external prerequisite codes (such as SWE20004) mentioned inside raw syllabus prose. "
                            "NEVER invent course codes, NEVER override the Recommender Sub-Agent's list of recommended units, "
                            "and NEVER fabricate contact hours, assessment breakdowns, or prerequisites not explicitly stated. "
                            "NEVER mention 'JSON', 'database', 'pgvector', 'context', or 'provided text'—refer naturally to 'the unit outline' or 'your academic profile'. "
                            "Format every unit summary or multi-part answer strictly with: "
                            "(1) concise **bullet points** for key takeaways, learning outcomes, and prerequisites; "
                            "(2) **GFM Markdown tables** whenever presenting structured breakdowns (Assessment Tasks & Weightings, Contact Hours, Weekly Syllabus Topics, or Recommended Units); and "
                            "(3) clean inline **numeric citation markers** (`[1]`, `[2]`, `[1, 2]`) at the end of claims or table rows mapped strictly to the 1-indexed `[Citation N]` numbers in Retrieved Syllabus Chunks (never output verbose raw URLs). "
                            "NEVER invent external URLs or citation numbers beyond the retrieved chunks. "
                            "When explaining prerequisite chains, include a compact ```mermaid graph TD``` diagram using only verified codes."
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

    best_sim = max((c.get("similarity", 0.0) for c in merged_citations), default=1.0)
    return {
        "answer": llm_answer,
        "citations": merged_citations,
        "tool_calls_used": tool_calls_used,
        "abstained": False,
        "abstain_reason": None,
        "top_similarity": round(float(best_sim), 2),
        "threshold": MAX_DISTANCE_THRESHOLD,
        "sources_checked": len(distances) if distances else len(merged_citations),
        "sources_passed": len(merged_citations),
        "latency_ms": int((time.time() - start_time) * 1000),
    }
