import json
from pathlib import Path

path = Path("doc/Dataset/cleaned_structured_syllabi.json")
data = json.loads(path.read_text(encoding="utf-8"))
print("First record keys:", list(data[0].keys()) if isinstance(data, list) else list(data.values())[0].keys())
