import json
import pymupdf
from pathlib import Path
import xml.etree.ElementTree as ET
from normalize import parse_xml_metadata, find_xml_text, extract_page0_metadata

def make_document_metadata(doc, source, doc_id):

    header = {
        "doc_id": doc_id,
        "source": str(source),
        "title": None,
        "document_type": [],
        "unit_code": None,
        "unit_name": None,
        "academic_year": None,
        "period": None,
        "page_count": doc.page_count,
        "pages": []
    }
    return{
        "pdf_header": header,
        "pdf_feature": None,
        "xml_feature": {
            "available": False,
            "raw": None
        }
    }
def load_pdf(path):
    doc = pymupdf.open(path)
    print(type(doc))
    print(doc.page_count)
    return doc

def save_json(metadata, path):
    # check for parent directory
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii= False, indent= 2)
    except OSError as e:
        print(f"Failed to write file: {e}")
        return False

    except TypeError as e:
        print(f"Object cannot be serialized to JSON")
        return False
    return True
def extract_pdf_metadata(doc, file, doc_id):
    metadata = make_document_metadata(doc, file, doc_id)
    page0 = extract_page0_metadata(doc[0], metadata)
    # PDF catalog
    cat = doc.pdf_catalog()
    metadata["pdf_feature"] = doc.xref_object(cat)

    # XMP metadata
    xml = doc.get_xml_metadata()
    if xml:
        metadata["xml_feature"]["available"] = True
        metadata["xml_feature"]["raw"] = parse_xml_metadata(xml)

        xml_root = metadata["xml_feature"]["raw"]["root"]
        title = find_xml_text(xml_root, "dc:title")

        if title:
            metadata["pdf_header"]["title"] = title
        else:
            print(f"No title found: {file.name}")

    return metadata


def iterate_dir(source_dir, metadata_dir):
    doc_id = 0

    for file in source_dir.iterdir():
        if file.suffix.lower() != ".pdf":
            continue

        doc = load_pdf(file)
        try:
            metadata = extract_pdf_metadata(doc, file, doc_id)

            output_path = metadata_dir / f"{file.stem}.json"

            if save_json(metadata, output_path):
                doc_id += 1

        finally:
            doc.close()

def main():
    Dir = Path("/mnt/d/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/doc/Archive")
    metadata_Dir = Path("/mnt/d/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/doc/JSON")
    iterate_dir(Dir, metadata_Dir)

if __name__ == "__main__":
    main()