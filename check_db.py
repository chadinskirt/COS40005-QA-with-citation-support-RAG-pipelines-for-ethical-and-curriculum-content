from pathlib import Path
import chromadb

# Resolve base directory relative to this script
BASE_DIR = Path(__file__).resolve().parent
CHROMA_DB_DIR = BASE_DIR / "doc" / "chroma_db"

print(f"Checking for ChromaDB at: {CHROMA_DB_DIR}")

try:
    client = chromadb.PersistentClient(path=str(CHROMA_DB_DIR))
    collections = client.list_collections()
    print(f"Found {len(collections)} collections: {[c.name for c in collections]}")
    
    for col in collections:
        collection = client.get_collection(name=col.name)
        count = collection.count()
        print(f"\n--- Collection '{col.name}' ---")
        print(f"Total document chunks: {count}")
        
        if count > 0:
            # Fetch a quick sample of metadata to verify sources/unit codes
            sample = collection.get(limit=3, include=["metadatas"])
            print("Sample stored metadata records:")
            for idx, meta in enumerate(sample.get("metadatas", [])):
                print(f"  {idx + 1}. {meta}")
        else:
            print("  (Warning: This collection is empty!)")
            
except Exception as e:
    print(f"Error reading ChromaDB: {e}")
