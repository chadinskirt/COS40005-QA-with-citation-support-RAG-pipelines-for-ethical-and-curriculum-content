import json
from pathlib import Path
import pandas as pd
from sentence_transformers import SentenceTransformer
from sqlalchemy import text

from models import (
    engine,
    Base,
    SessionLocal,
    Course,
    Prerequisite,
    CatalogueMapping,
    Student,
    SyllabusChunk,
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "doc" / "Dataset"
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"

print(f"Looking for data in: {DATASET_DIR}")


def _extract_syllabus_sections(unit_code: str, unit_data: dict | str) -> list[tuple[str, str]]:
    """
    Converts a structured syllabus record into labeled (section, text) chunks
    so retrieval can distinguish enrolment prerequisites from passing hurdles.
    """
    if isinstance(unit_data, str):
        return [("summary", f"{unit_code}: {unit_data.strip()}")] if unit_data.strip() else []

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
    # 1. Enable pgvector extension and recreate tables cleanly
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()

    print("Tables and pgvector extension created. Seeding relational data...")

    # 2. Load datasets
    prereq_df = pd.read_csv(DATASET_DIR / "Course_Prerequisites.csv")
    with open(DATASET_DIR / "Taxonomy_Mapping.json", "r", encoding="utf-8") as f:
        taxonomy = json.load(f)

    syllabi_path = DATASET_DIR / "cleaned_structured_syllabi.json"
    syllabi_raw = {}
    if syllabi_path.exists():
        with open(syllabi_path, "r", encoding="utf-8") as f:
            syllabi_raw = json.load(f)

    # Normalize syllabi into {unit_code: unit_data}
    syllabi_by_code: dict[str, dict | str] = {}
    if isinstance(syllabi_raw, dict):
        for k, v in syllabi_raw.items():
            code = (v.get("unit_code") or v.get("code") or k) if isinstance(v, dict) else k
            syllabi_by_code[str(code).strip().upper()] = v
    elif isinstance(syllabi_raw, list):
        for item in syllabi_raw:
            if isinstance(item, dict):
                code = item.get("unit_code") or item.get("code")
                if code:
                    syllabi_by_code[str(code).strip().upper()] = item

    # 3. Seed Courses (union of prerequisites, taxonomy, and syllabi JSON)
    unique_courses = (
        set(prereq_df["prerequisite"].dropna().str.strip().str.upper())
        .union(set(prereq_df["dependent"].dropna().str.strip().str.upper()))
        .union(set(syllabi_by_code.keys()))
    )
    for courses in taxonomy["catalogue_to_course"].values():
        unique_courses.update(c.strip().upper() for c in courses)

    for code in sorted(unique_courses):
        unit_obj = syllabi_by_code.get(code)
        unit_name = f"Unit {code}"
        if isinstance(unit_obj, dict):
            unit_name = unit_obj.get("title") or unit_obj.get("unit_name") or unit_obj.get("name") or unit_name
        session.add(Course(code=code, name=unit_name, credit_points=12.5))
    session.commit()

    # 4. Seed Prerequisites
    for _, row in prereq_df.iterrows():
        session.add(
            Prerequisite(
                dependent_code=str(row["dependent"]).strip().upper(),
                prerequisite_code=str(row["prerequisite"]).strip().upper(),
                rule_type=str(row["rule_type"]).strip().upper(),
            )
        )
    session.commit()

    # 5. Seed Catalogue Mappings
    for cat_id, courses in taxonomy["catalogue_to_course"].items():
        for code in courses:
            session.add(CatalogueMapping(catalogue_id=cat_id, course_code=code.strip().upper()))
    session.commit()

    # 6. Seed Students (including Current Student passed/failed lists if present in CSV)
    student_df = pd.read_csv(DATASET_DIR / "Synthetic_Student_Profiles_v1.csv")
    for _, row in student_df.iterrows():
        session.add(
            Student(
                student_id=int(row["Student_ID"]),
                target_career=row["Target_Career"],
                study_goal=row["Study_Goal"],
                major_code=row["Major_Code"] if "Major_Code" in row and pd.notna(row["Major_Code"]) else None,
                passed_units=_parse_unit_list(row["Passed_Units"]) if "Passed_Units" in row else [],
                failed_units=_parse_unit_list(row["Failed_Units"]) if "Failed_Units" in row else [],
                enrolled_units=_parse_unit_list(row["Enrolled_Units"]) if "Enrolled_Units" in row else [],
            )
        )
    session.commit()

    # 7. Embed & Seed SyllabusChunks into pgvector
    if syllabi_by_code:
        print(f"Encoding syllabus chunks with {EMBED_MODEL_NAME}...")
        embedder = SentenceTransformer(EMBED_MODEL_NAME)
        pending_chunks: list[tuple[str, str, int, str]] = []

        for code, unit_data in sorted(syllabi_by_code.items()):
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
            print(f"Inserted {len(pending_chunks)} pgvector syllabus chunks.")

    print(f"Database successfully seeded at {engine.url}")
    session.close()


if __name__ == "__main__":
    seed_database()
