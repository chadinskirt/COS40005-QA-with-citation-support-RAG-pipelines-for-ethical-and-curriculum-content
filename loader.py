import json
import pymupdf
from pathlib import Path
import xml.etree.ElementTree as ET
from normalize import parse_xml_metadata, find_xml_text, extract_page0_metadata, parse_xref, page0_xref_build, extracts_pdf_metadata, page_xref_build
from parse import parse_text_obj, extract_tables, remove_key_recursive, inspect_pdf
from pprint import pprint

def make_document_metadata(doc, source, doc_id):

    header = {
        "doc_id": doc_id,
        "source": str(source),
        "title": None,
        "document_type": None,
        "unit_code": None,
        "unit_name": None,
        "academic_year": None,
        "period": None,
        "page_count": doc.page_count,
    }
    return{
        "pdf_header": header,
        "pdf_feature": None,
        "xml_feature": {
            "available": False,
            "raw": None
        },
        "property": None,
        "pages": []
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
#passing metadata obj around can cause problem on lifetime and ownership
def extract_pdf_metadata(doc, file, doc_id):
    #format header structure documents
    metadata = make_document_metadata(doc, file, doc_id)

    #collect first page metadata
    page0 = extract_page0_metadata(doc[0], metadata)

    #collect first page xref
    Page0 = page0_xref_build(doc, doc[0], metadata)

    # collect PDF catalog
    cat = doc.pdf_catalog()
    metadata["pdf_feature"] = parse_xref(doc.xref_object(cat))

    # collect pdf metadata
    pdf_metadata = extracts_pdf_metadata(doc, metadata)

    metadata["pdf_header"]["title"] = pdf_metadata["title"]
    metadata["pdf_metadata"] = pdf_metadata

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
        # load and setup pages extraction
        doc = load_pdf(file)
        pages = []
        tables = []
        try:
            #build document metadata
            metadata = extract_pdf_metadata(doc, file, doc_id)
            metadata["property"] = inspect_pdf(doc)

            #main pages extraction
            for page_id, page in enumerate(doc):
                page_num = page.number + 1

                pages.append({
                    "page_num": page_num,
                    "xref": page.xref,
                    "page_object": page_xref_build(doc, page),
                    "elements": []
                })

                tables.extend(extract_tables(page, page_num))

            metadata["pages"] = pages
            metadata["tables"] = tables
            parse_text_obj(doc,metadata)
            remove_key_recursive(metadata["pages"], "lines")

            # compute the file directory    
            output_path = metadata_dir / f"{file.stem}.json"

            # check for update json blob before increase id
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