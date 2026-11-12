import csv
import json
from collections import defaultdict
from pathlib import Path
import chromadb

BASE_DIR = Path(__file__).resolve().parent
CHROMA_DB_DIR = BASE_DIR / "doc" / "chroma_db"
DATA_DIR = BASE_DIR / "doc" / "Dataset"

IGNORED_KEYS = {"bbox", "xref", "font", "matrix", "xml_feature", "pdf_feature", "color", "size"}

def collect_strings(obj, out: list):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k not in IGNORED_KEYS:
                collect_strings(v, out)
    elif isinstance(obj, list):
        for v in obj:
            collect_strings(v, out)
    elif isinstance(obj, str):
        cleaned = " ".join(obj.split())
        if len(cleaned) > 1:
            out.append(cleaned)

def extract_clean_text(item: dict) -> str:
    header = item.get("pdf_header", {})
    unit_code = header.get("unit_code", "")
    unit_name = header.get("unit_name", "")
    period = f"{header.get('period', '')} {header.get('academic_year', '')}".strip()

    intro = f"Unit Code: {unit_code}\nUnit Name: {unit_name}\nTeaching Period: {period}\n\n"

    texts = []
    # Extract nested text from page_content['object'] (and fallback to pages/tables)
    pc = item.get("page_content")
    if pc:
        collect_strings(pc, texts)
    if not texts and item.get("pages"):
        collect_strings(item["pages"], texts)
    if item.get("tables"):
        collect_strings(item["tables"], texts)

    # Deduplicate consecutive identical strings while preserving reading order
    deduped = []
    for t in texts:
        if not deduped or deduped[-1] != t:
            deduped.append(t)

    return intro + "\n".join(deduped)

def ingest_all():
    client = chromadb.PersistentClient(path=str(CHROMA_DB_DIR))
    try:
        client.delete_collection(name="syllabus_collection")
    except Exception:
        pass

    collection = client.get_or_create_collection(name="syllabus_collection")
    documents, metadatas, ids = [], [], []

    # 1. Ingest cleaned_structured_syllabi.json
    syllabi_path = DATA_DIR / "cleaned_structured_syllabi.json"
    with open(syllabi_path, "r", encoding="utf-8") as f:
        syllabi_data = json.load(f)
        units_list = syllabi_data if isinstance(syllabi_data, list) else syllabi_data.get("units", [])

        for idx, item in enumerate(units_list):
            if not isinstance(item, dict):
                continue
            header = item.get("pdf_header", {})
            unit_code = str(header.get("unit_code", "")).strip().upper()
            if not unit_code:
                continue

            clean_text = extract_clean_text(item)
            chunk_size, overlap = 1200, 200
            for c_idx in range(0, len(clean_text), chunk_size - overlap):
                chunk = clean_text[c_idx:c_idx + chunk_size].strip()
                if len(chunk) > 50:
                    documents.append(f"[{unit_code} - {header.get('unit_name', '')}]\n{chunk}")
                    metadatas.append({
                        "source": unit_code,
                        "unit_name": str(header.get("unit_name", "")),
                        "file": Path(header.get("source", "cleaned_structured_syllabi.json")).name
                    })
                    ids.append(f"{unit_code.lower()}_{idx}_chunk_{c_idx}")

    # 2. Ingest Course_Prerequisites.csv grouped by 'dependent' unit
    prereq_path = DATA_DIR / "Course_Prerequisites.csv"
    if prereq_path.exists():
        prereqs_by_unit = defaultdict(list)
        with open(prereq_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                dependent = (row.get("dependent") or "").strip().upper()
                prereq = (row.get("prerequisite") or "").strip().upper()
                rule = (row.get("rule_type") or "").strip().upper()
                if dependent and prereq:
                    prereqs_by_unit[dependent].append(f"- Prerequisite: {prereq} (Rule type: {rule})")

        for unit_code, rules in prereqs_by_unit.items():
            rules_text = "\n".join(rules)
            documents.append(
                f"[{unit_code} Official Prerequisites]\n"
                f"To enroll in {unit_code}, students must satisfy the following prerequisite requirements:\n"
                f"{rules_text}"
            )
            metadatas.append({
                "source": unit_code,
                "unit_name": unit_code,
                "file": "Course_Prerequisites.csv"
            })
            ids.append(f"prereq_{unit_code.lower()}")

    if documents:
        # Batch add to avoid ChromaDB max batch size limits
        batch_size = 200
        for i in range(0, len(documents), batch_size):
            collection.add(
                documents=documents[i:i + batch_size],
                metadatas=metadatas[i:i + batch_size],
                ids=ids[i:i + batch_size]
            )
        print(f"Successfully ingested {len(documents)} clean chunks (syllabi + prerequisites)!")

if __name__ == "__main__":
    ingest_all()
