import json
import re
from pathlib import Path

INPUT_DIR = Path("doc/JSON")
OUTPUT_DIR = Path("doc/Dataset")

def sanitize_string(raw_text):
    """Sanitize raw PDF text without losing its meaning."""
    if not raw_text or not isinstance(raw_text, str):
        return raw_text
    
    text = raw_text.replace("\u00a0", " ")
    text = re.sub(r'[^\x00-\x7F]+', ' ', text) # Drop non-ASCII artifacts
    text = re.sub(r'\n{2,}', '\n', text) # Normalize multiple newlines into a single break
    text = re.sub(r'[ \t]+', ' ', text) # Normalize horizontal spacing
    return text.strip()

def process_and_preserve_syllabi():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    consolidated_data = []
    
    for file_path in INPUT_DIR.glob("*.json"):
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        # 1. Sanitize text within standard document groups
        for page in data.get("pages", []):
            for group in page.get("groups", []):
                if "text" in group:
                    group["text"] = sanitize_string(group["text"])
                    
        # 2. Sanitize text within table cells while keeping the 2D array structure
        for table in data.get("tables", []):
            cleaned_rows = []
            for row in table.get("rows", []):
                # Clean each cell, handling potential nulls
                cleaned_row = [sanitize_string(cell) if cell else cell for cell in row]
                cleaned_rows.append(cleaned_row)
            table["rows"] = cleaned_rows
            
        # Append the fully preserved, cleaned dictionary to our master dataset
        consolidated_data.append(data)
        
    # Export as a single consolidated JSON array containing all structured data
    output_file = OUTPUT_DIR / "cleaned_structured_syllabi.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(consolidated_data, f, indent=4)
        
    print(f"Successfully cleaned {len(consolidated_data)} syllabi while preserving all structural elements.")
    print(f"Saved to {output_file}")

if __name__ == "__main__":
    process_and_preserve_syllabi()
