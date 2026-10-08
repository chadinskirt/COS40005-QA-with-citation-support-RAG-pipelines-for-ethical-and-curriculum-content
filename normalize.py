import io
import xml.etree.ElementTree as ET
import re

#extract first 3-4 upper case letter and following 4-5 numbers 
def extract_unit_code(lines):
    UNIT_CODE_RE = re.compile(r"\b[A-Z]{3,4}\d{4,5}\b")
    for line in lines:
        match = UNIT_CODE_RE.search(line)
        if match:
            return match.group(0)

    return None

#extract the pdf data within the line contain Semester , capture month/period by group 1 and group 2 for academic years
def extract_semester(lines):
    SEMESTER_RE = re.compile(
    r"\bSemester\s+(.+?)\s+(\d{4})\b",
    re.IGNORECASE
    )
    for line in lines:
        match = SEMESTER_RE.search(line)

        if match:
            return {
                "period": match.group(1).strip().rstrip(","),
                "academic_year": int(match.group(2))
            }

    return None

#if fullymatch the Unit code extract next line of unit name
def extract_unit_name(lines):
    UNIT_CODE_RE = re.compile(r"\b[A-Z]{3,4}\d{4,5}\b")
    for i, line in enumerate(lines):
        if UNIT_CODE_RE.fullmatch(line):
            if i + 1 < len(lines):
                return lines[i + 1]

    return None
# collapsed bracket and compared namespace to collected tag
def collapse_tag(tag, namespaces):
    if tag.startswith("{"):
        uri, local = tag[1:].split("}", 1)

        for prefix, namespace in namespaces.items():
            if namespace == uri:
                return f"{prefix}:{local}"

        return local

    return tag

#collect and conflict resolve xml metadata withit namespace
def element_to_dict(element, namespaces):
    node = {
        "tag": collapse_tag(element.tag, namespaces),
        "attributes": dict(element.attrib),
        "text": element.text.strip()
                if element.text and element.text.strip()
                else None,
        "children": []
    }

    for child in element:
        node["children"].append(
            element_to_dict(child, namespaces)
        )

    return node

# extract tag and child branch text of xml structure 
def find_xml_text(node, tag):
    if node["tag"] == tag:
        if node["text"]:
            return node["text"]

        for child in node["children"]:
            text = find_first_text(child)
            if text:
                return text

        return None

    for child in node["children"]:
        result = find_xml_text(child, tag)
        if result:
            return result

    return None

#explore for first text within the node
def find_first_text(node):
    if node["text"]:
        return node["text"]

    for child in node["children"]:
        text = find_first_text(child)
        if text:
            return text

    return None

#collect xml namespace for conventional normalization
def elements_header_to_dicts(xml):
    namespace = {}
    for event, elem in ET.iterparse(io.StringIO(xml), events=["start-ns"]):
        prefix,uri = elem
        namespace[prefix] = uri
    return namespace

#string and structure xml output
def parse_xml_metadata(xml):
    if not xml:
        return {
            "root": None,
            "namespace": None
        }

    root = ET.fromstring(xml)
    namespace = elements_header_to_dicts(xml)

    return {
        "root": element_to_dict(root, namespace),
        "namespace": namespace
    }

#extract page[0] of pdf content and update to json header
def extract_page0_metadata(page,metadata):
    text = page.get_text("text")

    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    metadata["pdf_header"]["unit_code"] = extract_unit_code(lines)
    metadata["pdf_header"]["unit_name"] = extract_unit_name(lines)

    semester = extract_semester(lines)

    if semester:
        metadata["pdf_header"]["period"] = semester["period"]
        metadata["pdf_header"]["academic_year"] = semester["academic_year"]

    if metadata["pdf_header"]["unit_code"]:
        metadata["pdf_header"]["document_type"] = "unit_outline"
    else:
        metadata["pdf_header"]["document_type"] = "ethicals"

    return metadata