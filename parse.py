import json
import pymupdf
import re
from statistics import median

def inspect_pdf(doc):
    text_chars = 0
    image_count = 0
    drawing_count = 0
    table_count = 0

    for page in doc:
        text_chars += len(page.get_text("text"))
        image_count += len(page.get_images(full=True))
        drawing_count += len(page.get_drawings())
        table_count += len(page.find_tables().tables)

    return {
        "pages": len(doc),
        "text_chars": text_chars,
        "images": image_count,
        "drawings": drawing_count,
        "tables": table_count,
    }

def remove_key_recursive(node, target):
    if isinstance(node, dict):
        node.pop(target, None)

        for value in node.values():
            remove_key_recursive(value, target)

    elif isinstance(node, list):
        for item in node:
            remove_key_recursive(item, target)

def clean_text(text):
    text = text.replace("\u00a0", " ")  # non-breaking spaces
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def is_new_list_item(text):
    NUMBERED_ITEM = re.compile(r"^\s*\d+[.)]\s+")
    LETTERED_ITEM = re.compile(r"^\s*[a-zA-Z][.)]\s+")
    BULLET_ITEM = re.compile(r"^\s*[•▪◦‣]\s+")
    return bool(
        NUMBERED_ITEM.match(text)
        or LETTERED_ITEM.match(text)
        or BULLET_ITEM.match(text)
    )

def normalize_bullet(line):
    BULLETS = ("•", "▪", "◦", "‣", "■")
    stripped = line.lstrip()

    for bullet in BULLETS:
        if stripped.startswith(bullet):
            return "- " + stripped[len(bullet):].strip()

    return line

def get_text_style(element):
    spans = [
        span
        for line in element["lines"]
        for span in line["spans"]
        if span["text"].strip()
    ]

    if not spans:
        return None

    sizes = [span["size"] for span in spans]
    bold_count = sum(bool(span["flags"] & 16) for span in spans)

    return {
        "fonts": sorted({span["font"] for span in spans}),
        "font_size": median(sizes),
        "bold_ratio": bold_count / len(spans),
    }

def get_line_style(line):
    spans = [
        span
        for span in line["spans"]
        if span["text"].strip()
    ]

    if not spans:
        return None

    sizes = [span["size"] for span in spans]
    bold_count = sum(
        bool(span["flags"] & 16)
        for span in spans
    )

    return {
        "fonts": sorted({span["font"] for span in spans}),
        "font_size": median(sizes),
        "bold_ratio": bold_count / len(spans),
    }

def classify_line(line, body_font_size):
    text = " ".join(line["text"].split()).strip()

    if not text:
        return "empty"

    if is_new_list_item(text):
        return "list_item"

    normalized = text.rstrip(": .").casefold()

    if normalized in KNOWN_HEADINGS:
        return "section_heading"

    style = get_line_style(line)

    if style is None:
        return "body"

    short_text = len(text) <= 80
    ends_like_sentence = text.endswith((".", ",", ";", "?"))

    larger_font = (
        style["font_size"] >= body_font_size + 0.5
    )
    bold = style["bold_ratio"] >= 0.8

    if short_text and larger_font and bold and not ends_like_sentence:
        return "section_heading"

    if short_text and bold and not ends_like_sentence:
        return "possible_heading"

    return "body"

def same_text_style(a, b):
    style_a = get_text_style(a)
    style_b = get_text_style(b)

    if style_a is None or style_b is None:
        return False

    return (
        style_a["fonts"] == style_b["fonts"]
        and abs(style_a["font_size"] - style_b["font_size"]) < 0.5
        and style_a["bold_ratio"] == style_b["bold_ratio"]
    )

def classify_text_elements(metadata, body_font_size):
    normalized_elements = []

    for element in metadata["elements"]:
        if element["type"] != "text":
            normalized_elements.append(element)
            continue

        current = None

        for line in element["lines"]:
            role = classify_line(line, body_font_size)
            line_text = line["text"].strip()

            if not line_text:
                continue

            # Start a new logical element at a heading boundary.
            if current is None or role == "section_heading" or (
                current["role"] == "section_heading"
            ):
                if current is not None:
                    normalized_elements.append(current)

                current = {
                    "id": element["id"],
                    "type": "text",
                    "bbox": list(line["spans"][0]["bbox"]),
                    "text": line_text,
                    "role": role,
                    "source_id": element["id"],
                    "lines": [line],
                }
            else:
                current["text"] += "\n" + line_text
                current["lines"].append(line)

                # Expand the bounding box.
                for span in line["spans"]:
                    x0, y0, x1, y1 = span["bbox"]
                    current["bbox"][0] = min(current["bbox"][0], x0)
                    current["bbox"][1] = min(current["bbox"][1], y0)
                    current["bbox"][2] = max(current["bbox"][2], x1)
                    current["bbox"][3] = max(current["bbox"][3], y1)

        if current is not None:
            normalized_elements.append(current)

    metadata["elements"] = normalized_elements
    return metadata

KNOWN_HEADINGS = {
    "Aims",
    "Unit Learning Outcomes",
    "Graduate Attributes",
    "Assessment",
    "Content",
    "Recommended Reading Materials",
    "Required Textbook(s)",
    "Student behaviour and wellbeing",
    "Canvas",
    "Communication",
    "Academic Integrity",
    "Student support",
    "Special consideration",
    "AccessAbility Services",
    "Review of marks",
    "Feedback, complaints and suggestions",
    "Advocacy"
}

def classify_heading(element, body_font_size):
    text = " ".join(element["text"].split()).strip()

    if not text:
        return "empty"

    # Numbered and lettered items should be handled separately.
    if is_new_list_item(text):
        return "list_item"

    normalized = re.sub(r"[:.]$", "", text).casefold()

    if normalized in KNOWN_HEADINGS:
        return "section_heading"

    style = get_text_style(element)

    if style is None:
        return "body"

    short_text = len(text) <= 80
    ends_like_sentence = text.endswith((".", ",", ";", "?"))

    # Strong typography signal.
    larger_font = style["font_size"] >= body_font_size + 1.5
    bold = style["bold_ratio"] >= 0.8

    if larger_font and short_text:
        return "section_heading"

    if bold and short_text and not ends_like_sentence:
        return "possible_heading"

    return "body"


def parse_text_obj(doc, metadata):
    next_id = 0

    for page_index, page in enumerate(doc):
        table_regions = [
                list(table.bbox)
                for table in page.find_tables().tables
            ]
        page_data = page.get_text("dict")
        page_record = metadata["pages"][page_index]

        for block in page_data["blocks"]:
            if block["type"] != 0:
                continue
            bbox = block["bbox"]

            if is_inside_table(bbox, table_regions):
                continue

            if is_header_or_footer(bbox, page.rect):
                continue

            lines = []
            block_lines = []

            for line in block["lines"]:
                spans = []
                line_parts = []

                for span in line["spans"]:
                    text = span["text"]

                    spans.append({
                        "text": text,
                        "bbox": list(span["bbox"]),
                        "font": span["font"],
                        "size": span["size"],
                        "flags": span["flags"],
                    })

                    line_parts.append(text)

                # Reconstruct the complete line first
                line_text = "".join(line_parts)

                # Normalize whitespace and bullet markers
                line_text = clean_text(line_text)
                line_text = normalize_bullet(line_text)

                lines.append({
                    "spans": spans,
                    "text": line_text,
                })

                block_lines.append(line_text)

            block_text = "\n".join(
                text for text in block_lines if text
            )

            obj = {
                "id": f"txt_{next_id:06d}",
                "type": "text",
                "bbox": list(block["bbox"]),
                "text": block_text,
                "lines": lines,
            }

            page_record["elements"].append(obj)
            next_id += 1
            page_record = classify_text_elements(
                page_record,
                body_font_size=11.04
            )

            page_record = group_page_elements(page_record)

def parse_links(page):
    links = page.get_links()

    for link in links:
        print({
            "kind": link.get("kind"),
            "from": list(link["from"]),
            "uri": link.get("uri"),
            "page": link.get("page"),
        })

def overlaps(a, b):
    return (
        a[0] < b[2] and
        a[2] > b[0] and
        a[1] < b[3] and
        a[3] > b[1]
    )

def is_inside_table(bbox, table_regions):
    return any(overlaps(bbox, region) for region in table_regions)

def is_header_or_footer(bbox, page_rect, top_ratio=0.10,
                        bottom_ratio=0.90):
    page_height = page_rect.height

    near_top = bbox[3] < page_height * top_ratio
    near_bottom = bbox[1] > page_height * bottom_ratio

    return near_top or near_bottom


def group_page_elements(metadata, gap_threshold=12, x_tolerance=20):
    groups = []
    current = None
    previous_bbox = None
    previous_element = None

    elements = sorted(
        metadata["elements"],
        key=lambda obj: (obj["bbox"][1], obj["bbox"][0])
    )

    for element in elements:
        if element["type"] != "text":
            continue

        text = element["text"].strip()
        if not text:
            continue

        x0, y0, x1, y1 = element["bbox"]
        bbox = list(element["bbox"])

        if current is None:
            current = {
                "type": "text_group",
                "page_num": metadata["page_num"],
                "bbox": bbox.copy(),
                "text": text,
                "element_ids": [element["id"]],
            }
            previous_bbox = bbox
            previous_element = element
            continue

        px0, py0, px1, py1 = previous_bbox
        vertical_gap = y0 - py1

        horizontal_overlap = min(x1, px1) - max(x0, px0)
        min_width = min(x1 - x0, px1 - px0)

        overlaps_horizontally = (
            min_width > 0
            and horizontal_overlap / min_width >= 0.3
        )

        left_aligned = abs(x0 - px0) <= x_tolerance

        classify_heading(element, 11.039999961853027)

        can_merge = (
            -2 <= vertical_gap <= gap_threshold
            and (overlaps_horizontally or left_aligned)
            and same_text_style(previous_element, element)
            and not is_new_list_item(text)
            and previous_element["role"] != "section_heading"
            and element["role"] != "section_heading"
        )

        if not can_merge:
            groups.append(current)

            current = {
                "type": "text_group",
                "page_num": metadata["page_num"],
                "bbox": bbox.copy(),
                "text": text,
                "element_ids": [element["id"]],
            }
        else:
            current["text"] += "\n" + text

            current["bbox"][0] = min(current["bbox"][0], x0)
            current["bbox"][1] = min(current["bbox"][1], y0)
            current["bbox"][2] = max(current["bbox"][2], x1)
            current["bbox"][3] = max(current["bbox"][3], y1)

            current["element_ids"].append(element["id"])

        # Always track the immediately preceding element.
        previous_bbox = bbox
        previous_element = element

    if current is not None:
        groups.append(current)

    metadata["groups"] = groups
    return metadata

def extract_tables(page, page_num):
    tables = []

    for index, table in enumerate(page.find_tables().tables):
        tables.append({
            "id": f"tbl_{page_num:03}_{index:03}",
            "type": "table",
            "page_num": page_num,
            "bbox": list(table.bbox),
            "rows": table.extract(),
        })

    return tables

def is_in_margin(bbox, page_rect, margin_ratio=0.08):
    page_height = page_rect.height
    top_limit = page_rect.y0 + page_height * margin_ratio
    bottom_limit = page_rect.y1 - page_height * margin_ratio

    return bbox[3] <= top_limit or bbox[1] >= bottom_limit