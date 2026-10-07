import json
import pymupdf
from pathlib import Path

def make_document_metadata(doc, source, doc_id):

    header = {
        "doc_id": doc_id,
        "source": str(source),
        "title": None,
        "document_type": [],
        "unit_code": None,
        "unit_name": None,
        "academic_year": None,
        "semester": None,
        "page_count": doc.page_count,
        "pages": []
    }
    ref =  {
        "language": None,
        "is_tagged": False,
        "has_metadata": False,
        "has_structure_tree": False,
        "has_acroform": False,

        "pages_xref": None,
        "metadata_xref": None,
        "structure_tree_xref": None,
        "acroform_xref": None
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
def iterate_dir(Dir,metadata_Dir):
    #print(Dir.exists())
    #print(Dir.resolve())
    doc_id = 0
    save = False

    for file in Dir.iterdir():
        if file.suffix.lower() != ".pdf":
            continue
        #load and create boilerplate metadata
        doc = load_pdf(file)
        metadata = make_document_metadata(doc, file, doc_id)
        # catalog authoritive reference site
        cat = doc.pdf_catalog()
        metadata["pdf_feature"] = doc.xref_object(cat)
        #collect pdf xml metadata
        xml = doc.get_xml_metadata()
        if xml:
            metadata["xml_feature"]["available"] = True
            metadata["xml_feature"]["raw"] = xml
        #output and save json files
        output_path = metadata_Dir/ f"{file.stem}.json"
        if save_json(metadata, output_path):
            doc_id += 1

        doc.close()

def main():
    Dir = Path("/mnt/d/pdf-MD_parser")
    metadata_Dir = Path("/mnt/d/pdf-MD_parser/JSON")
    iterate_dir(Dir, metadata_Dir)

if __name__ == "__main__":
    main()