import json
import chromadb
from pathlib import Path

DATASET_PATH = Path("../doc/Dataset/cleaned_structured_syllabi.json")
CHROMA_DB_DIR = Path("../doc/chroma_db")

def initialize_vector_store():
    # Initialize persistent ChromaDB client
    client = chromadb.PersistentClient(path=str(CHROMA_DB_DIR))
    
    # Create or load the collection
    # We use cosine similarity which works well for academic text
    collection = client.get_or_create_collection(
        name="syllabus_collection",
        metadata={"hnsw:space": "cosine"}
    )
    
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        syllabi = json.load(f)
        
    docs = []
    metadatas = []
    ids = []
    
    for idx, course in enumerate(syllabi):
        header = course.get("pdf_header", {})
        unit_code = header.get("unit_code", f"UNKNOWN_{idx}")
        
        # Flatten text groups for baseline embedding
        full_text = ""
        for page in course.get("pages", []):
            for group in page.get("groups", []):
                full_text += group.get("text", "") + " "
                
        docs.append(full_text.strip())
        metadatas.append({
            "unit_code": unit_code, 
            "unit_name": header.get("unit_name", "Unknown Name")
        })
        ids.append(unit_code)
        
    # Batch upsert into vector database
    collection.upsert(documents=docs, metadatas=metadatas, ids=ids)
    print(f"Successfully vectorized {len(docs)} syllabi into ChromaDB at {CHROMA_DB_DIR}")

if __name__ == "__main__":
    initialize_vector_store()
