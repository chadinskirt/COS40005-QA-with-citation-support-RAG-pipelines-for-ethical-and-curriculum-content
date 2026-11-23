import re
import json
from pathlib import Path
import pandas as pd
import pymupdf
from sentence_transformers import SentenceTransformer

try:
    from service.models import (
        init_db,
        SessionLocal,
        Course,
        Prerequisite,
        CatalogueMapping,
        Student,
        SyllabusChunk,
    )
except ImportError:
    from models import (
        init_db,
        SessionLocal,
        Course,
        Prerequisite,
        CatalogueMapping,
        Student,
        SyllabusChunk,
    )

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "doc" / "Dataset"
JSON_DIR = BASE_DIR / "doc" / "JSON"
ARCHIVE_DIR = BASE_DIR / "doc" / "Archive"
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"

KNOWN_UNIT_NAMES = {
    "COS10004": "Computer Systems",
    "COS10009": "Introduction to Programming",
    "COS10022": "Data Science Principles",
    "COS10025": "Technology in an Indigenous Context Project",
    "COS10026": "Computing Technology Inquiry Project",
    "COS20007": "Object Oriented Programming",
    "COS20019": "Cloud Computing Architecture",
    "COS20031": "Database Design Project",
    "COS30018": "Intelligent Systems",
    "COS30019": "Introduction to Artificial Intelligence",
    "COS30049": "Computing Technology Innovation Project",
    "COS30082": "Applied Machine Learning",
    "COS40003": "Concurrent Programming",
    "COS40005": "Computing Technology Project A",
    "COS40006": "Computing Technology Project B",
    "COS40007": "Artificial Intelligence Engineering",
    "LAW20019": "Law of Commerce",
    "MDA10018": "Content Creator Lab",
    "MTH10013": "Linear Algebra and Applications",
    "STA10003": "Foundations of Statistics",
    "SWE30003": "Software Architectures and Design",
    "TNE10006": "Networks and Switching",
    "TNE30009": "Network Security and Resilience",
}


def _extract_syllabus_sections(unit_code: str, unit_data: dict | list | str) -> list[tuple[str, str]]:
    if isinstance(unit_data, str):
        return [("summary", f"{unit_code}: {unit_data.strip()}")] if unit_data.strip() else []

    if isinstance(unit_data, list):
        chunks = []
        for idx, item in enumerate(unit_data):
            text_piece = json.dumps(item, ensure_ascii=False) if isinstance(item, dict) else str(item)
            if text_piece.strip():
                chunks.append(("summary", f"Unit {unit_code} (Section {idx + 1}):\n{text_piece.strip()}"))
        return chunks

    sections: list[tuple[str, str]] = []
    title = unit_data.get("title") or unit_data.get("unit_name") or unit_data.get("name") or ""
    header = f"Unit {unit_code}" + (f" - {title}" if title else "")

    for key, value in unit_data.items():
        if value is None or key in {"unit_code", "code", "title", "unit_name", "name"}:
            continue

        key_lower = key.lower()
        if any(w in key_lower for w in ["prereq", "enrol", "requisite", "assumed"]):
            section_label = "prerequisites"
        elif any(w in key_lower for w in ["hurdle", "pass", "grade"]):
            section_label = "hurdles"
        elif any(w in key_lower for w in ["assess", "exam", "assignment", "weight"]):
            section_label = "assessments"
        elif any(w in key_lower for w in ["outcome", "clo", "skill", "topic"]):
            section_label = "learning_outcomes"
        else:
            section_label = "summary"

        if isinstance(value, list):
            formatted = "\n".join(
                f"- {json.dumps(item, ensure_ascii=False) if isinstance(item, dict) else str(item)}"
                for item in value
                if item
            )
        elif isinstance(value, dict):
            formatted = "\n".join(f"- {k}: {v}" for k, v in value.items() if v)
        else:
            formatted = str(value).strip()

        if formatted:
            sections.append((section_label, f"{header} ({key}):\n{formatted}"))

    return sections


def _extract_pdf_unit_data(pdf_path: Path) -> tuple[str | None, dict | None]:
    """Extracts unit code, unit name, and structured sections from a unit outline PDF."""
    doc = pymupdf.open(pdf_path)
    pages_text = [page.get_text("text") for page in doc]
    full_text = "\n".join(pages_text)

    code_match = re.search(r"[A-Za-z]{3}\d{5}", pdf_path.stem) or re.search(r"\b([A-Za-z]{3}\d{5})\b", full_text)
    if not code_match:
        return None, None
    code = code_match.group(0).upper()

    unit_name = KNOWN_UNIT_NAMES.get(code)
    if not unit_name and pages_text:
        lines = [ln.strip() for ln in pages_text[0].splitlines() if ln.strip()]
        for i, ln in enumerate(lines):
            if ln.upper() == code and i + 1 < len(lines):
                candidate = lines[i + 1]
                if not candidate.lower().startswith("please read"):
                    unit_name = candidate
                    break
    unit_name = unit_name or f"Unit {code}"

    # Group pages into semantic sections so RAG intent filtering works identically to JSON outlines
    buckets: dict[str, list[str]] = {
        "prerequisites": [],
        "learning_outcomes": [],
        "assessments": [],
        "hurdles": [],
        "summary": [],
    }
    for page_idx, raw_page in enumerate(pages_text, start=1):
        cleaned = re.sub(r"\n{3,}", "\n\n", raw_page).strip()
        if not cleaned:
            continue
        lower = cleaned.lower()
        if any(w in lower for w in ["requisites:", "pre-requisites", "co-requisites"]):
            buckets["prerequisites"].append(f"[Page {page_idx}]\n{cleaned}")
        elif any(w in lower for w in ["assessment", "hurdle", "pass this unit", "weighting"]):
            if "hurdle" in lower or "minimum standard" in lower:
                buckets["hurdles"].append(f"[Page {page_idx}]\n{cleaned}")
            else:
                buckets["assessments"].append(f"[Page {page_idx}]\n{cleaned}")
        elif any(w in lower for w in ["learning outcomes", "aims", "topics"]):
            buckets["learning_outcomes"].append(f"[Page {page_idx}]\n{cleaned}")
        else:
            buckets["summary"].append(f"[Page {page_idx}]\n{cleaned}")

    unit_dict: dict[str, object] = {
        "unit_code": code,
        "unit_name": unit_name,
    }
    for key, pieces in buckets.items():
        if pieces:
            # Chunk long combined text into ~1500-char blocks so embeddings remain focused
            combined = "\n\n".join(pieces)
            if len(combined) <= 1800:
                unit_dict[key] = combined
            else:
                unit_dict[key] = [combined[i : i + 1500] for i in range(0, len(combined), 1500)]

    return code, unit_dict


def _load_all_unit_syllabi() -> dict[str, dict | list | str]:
    syllabi_by_code: dict[str, dict | list | str] = {}
    if JSON_DIR.exists():
        for json_file in sorted(JSON_DIR.glob("*.json")):
            if json_file.name.lower() == "catalogue.json":
                continue

            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            code = None
            if isinstance(data, dict):
                code = data.get("unit_code") or data.get("code")
            if not code:
                match = re.search(r"[A-Za-z]{3}\d{5}", json_file.stem)
                if match:
                    code = match.group(0)

            if code:
                syllabi_by_code[str(code).strip().upper()] = data

    if ARCHIVE_DIR.exists():
        for pdf_file in sorted(ARCHIVE_DIR.glob("*.pdf")):
            code_match = re.search(r"[A-Za-z]{3}\d{5}", pdf_file.stem)
            if code_match and code_match.group(0).upper() in syllabi_by_code:
                continue
            code, pdf_data = _extract_pdf_unit_data(pdf_file)
            if code and pdf_data and code not in syllabi_by_code:
                syllabi_by_code[code] = pdf_data

    return syllabi_by_code


def _parse_unit_list(raw_val) -> list[str]:
    if pd.isna(raw_val) or not str(raw_val).strip():
        return []
    text_val = str(raw_val).strip()
    if text_val.startswith("["):
        try:
            return [u.strip().upper() for u in json.loads(text_val) if str(u).strip()]
        except json.JSONDecodeError:
            pass
    return [u.strip().upper() for u in text_val.replace(";", ",").split(",") if u.strip()]


def seed_database():
    init_db()
    session = SessionLocal()

    prereq_df = pd.read_csv(DATASET_DIR / "Course_Prerequisites.csv")
    with open(DATASET_DIR / "Taxonomy_Mapping.json", "r", encoding="utf-8") as f:
        taxonomy = json.load(f)

    syllabi_by_code = _load_all_unit_syllabi()
    print(f"Loaded {len(syllabi_by_code)} unit outlines from {JSON_DIR} and {ARCHIVE_DIR}")

    # 1. Upsert Courses
    unique_courses = (
        set(prereq_df["prerequisite"].dropna().str.strip().str.upper())
        .union(set(prereq_df["dependent"].dropna().str.strip().str.upper()))
        .union(set(syllabi_by_code.keys()))
    )
    for courses in taxonomy["catalogue_to_course"].values():
        unique_courses.update(c.strip().upper() for c in courses)

    for code in sorted(unique_courses):
        unit_obj = syllabi_by_code.get(code)
        unit_name = KNOWN_UNIT_NAMES.get(code, f"Unit {code}")
        if isinstance(unit_obj, dict):
            unit_name = (
                unit_obj.get("title")
                or unit_obj.get("unit_name")
                or unit_obj.get("name")
                or unit_name
            )
        existing = session.get(Course, code)
        if existing:
            if unit_name and unit_name != f"Unit {code}":
                existing.name = unit_name
        else:
            session.add(Course(code=code, name=unit_name, credit_points=12.5))
    session.commit()

    # 2. Upsert Prerequisites (skip duplicates)
    existing_prereqs = {
        (p.dependent_code, p.prerequisite_code, p.rule_type)
        for p in session.query(Prerequisite).all()
    }
    for _, row in prereq_df.iterrows():
        key = (
            str(row["dependent"]).strip().upper(),
            str(row["prerequisite"]).strip().upper(),
            str(row["rule_type"]).strip().upper(),
        )
        if key not in existing_prereqs:
            session.add(
                Prerequisite(
                    dependent_code=key[0],
                    prerequisite_code=key[1],
                    rule_type=key[2],
                )
            )
            existing_prereqs.add(key)
    session.commit()

    # 3. Upsert Catalogue Mappings (skip duplicates)
    existing_mappings = {
        (m.catalogue_id, m.course_code)
        for m in session.query(CatalogueMapping).all()
    }
    for cat_id, courses in taxonomy["catalogue_to_course"].items():
        for code in courses:
            key = (cat_id, code.strip().upper())
            if key not in existing_mappings:
                session.add(CatalogueMapping(catalogue_id=key[0], course_code=key[1]))
                existing_mappings.add(key)
    session.commit()

    # 4. Upsert Synthetic Students (preserve existing student records)
    student_df = pd.read_csv(DATASET_DIR / "Synthetic_Student_Profiles_v1.csv")
    for _, row in student_df.iterrows():
        sid = int(row["Student_ID"])
        if session.get(Student, sid) is not None:
            continue
        session.add(
            Student(
                student_id=sid,
                target_career=row["Target_Career"],
                study_goal=row["Study_Goal"],
                major_code=row["Major_Code"] if "Major_Code" in row and pd.notna(row["Major_Code"]) else None,
                passed_units=_parse_unit_list(row["Passed_Units"]) if "Passed_Units" in row else [],
                failed_units=_parse_unit_list(row["Failed_Units"]) if "Failed_Units" in row else [],
                enrolled_units=_parse_unit_list(row["Enrolled_Units"]) if "Enrolled_Units" in row else [],
            )
        )
    session.commit()

    # 5. Embed & Upsert SyllabusChunks into pgvector (replace per course_code to avoid duplicates)
    if syllabi_by_code:
        print(f"Encoding syllabus chunks with {EMBED_MODEL_NAME}...")
        embedder = SentenceTransformer(EMBED_MODEL_NAME)
        pending_chunks: list[tuple[str, str, int, str]] = []

        for code, unit_data in sorted(syllabi_by_code.items()):
            session.query(SyllabusChunk).filter(SyllabusChunk.course_code == code).delete()
            sections = _extract_syllabus_sections(code, unit_data)
            for idx, (sec_label, chunk_text) in enumerate(sections):
                pending_chunks.append((code, sec_label, idx, chunk_text))

        if pending_chunks:
            texts = [c[3] for c in pending_chunks]
            vectors = embedder.encode(texts, batch_size=32, show_progress_bar=False)

            for (code, sec_label, idx, chunk_text), vec in zip(pending_chunks, vectors):
                session.add(
                    SyllabusChunk(
                        course_code=code,
                        section=sec_label,
                        chunk_index=idx,
                        content=chunk_text,
                        embedding=vec.tolist(),
                    )
                )
            session.commit()
            print(f"Upserted {len(pending_chunks)} pgvector syllabus chunks.")

    session.close()


if __name__ == "__main__":
    seed_database()
