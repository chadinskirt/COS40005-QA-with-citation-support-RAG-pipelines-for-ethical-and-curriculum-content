import re
import time
import requests
from pathlib import Path
import chromadb

BASE_DIR = Path(__file__).resolve().parent.parent
CHROMA_DB_DIR = BASE_DIR / "doc" / "chroma_db"

MAX_DISTANCE_THRESHOLD = 1.2
LLM_MODEL = "qwen3:8b" 

chroma_client = chromadb.PersistentClient(path=str(CHROMA_DB_DIR))
collection = chroma_client.get_or_create_collection(name="syllabus_collection")

def get_chat_response(question: str, history: list = None) -> dict:
    start_time = time.time()
    
    # 1. Extract unit code from the question if present (e.g., COS30018, COS20019)
    unit_code_match = re.search(r'cos\d{5}', question, re.IGNORECASE)
    chroma_filter = None
    
    if unit_code_match:
        target_unit = unit_code_match.group(0).upper()
        # Assuming your Chroma metadata stores the unit code under a key like 'unit_code' or 'source'
        chroma_filter = {"source": {"$contains": target_unit}}

    # 2. Query ChromaDB with optional metadata filtering
    query_params = {
        "query_texts": [question],
        "n_results": 5
    }
    if chroma_filter:
        query_params["where"] = chroma_filter

    results = collection.query(**query_params)
    
    distances = results.get('distances', [[999.0]])[0]
    documents = results.get('documents', [[]])[0]
    metadatas = results.get('metadatas', [[]])[0]
    
    # Fallback if filtered query returns nothing
    if not distances or not documents:
        return {
            "answer": f"I could not find any syllabus records matching unit code {target_unit if unit_code_match else ''}.",
            "citations": [],
            "abstained": True,
            "abstain_reason": "UNIT_NOT_FOUND",
            "top_similarity": 999.0,
            "threshold": MAX_DISTANCE_THRESHOLD,
            "sources_checked": 0,
            "sources_passed": 0,
            "latency_ms": int((time.time() - start_time) * 1000)
        }
        
    best_match_distance = min(distances)
    
    if best_match_distance > MAX_DISTANCE_THRESHOLD:
        return {
            "answer": None,
            "citations": [],
            "abstained": True,
            "abstain_reason": "LOW_SIMILARITY",
            "top_similarity": round(best_match_distance, 2),
            "threshold": MAX_DISTANCE_THRESHOLD,
            "sources_checked": len(distances),
            "sources_passed": 0,
            "latency_ms": int((time.time() - start_time) * 1000)
        }
            
    citations = []
    context_chunks = []
    
    for doc, meta, dist in zip(documents, metadatas, distances):
        if dist <= MAX_DISTANCE_THRESHOLD:
            context_chunks.append(doc)
            citations.append({
                "source_file": meta.get("source", "Syllabus"),
                "text_snippet": doc,
                "similarity_score": round(dist, 2)
            })
                
    context_prompt = "\n\n".join(context_chunks)
    full_prompt = f"Use the following academic syllabus context to answer the student's question accurately.\n\nContext:\n{context_prompt}\n\nQuestion: {question}"
    
    try:
        llm_response = requests.post(
            "http://localhost:11434/api/chat",
            json={
                "model": LLM_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a precise academic advising assistant. Answer using ONLY the provided syllabus Context. Do not mix up unit codes."
                    },
                    {
                        "role": "user",
                        "content": full_prompt
                    }
                ],
                "stream": False
            }
        )
        llm_answer = llm_response.json().get("message", {}).get("content", "Error reading LLM response.")
    except Exception as e:
        llm_answer = f"LLM connection failed. Error: {str(e)}"
    
    return {
        "answer": llm_answer,
        "citations": citations,
        "abstained": False,
        "abstain_reason": None,
        "top_similarity": round(best_match_distance, 2),
        "threshold": MAX_DISTANCE_THRESHOLD,
        "sources_checked": len(distances),
        "sources_passed": len(citations),
        "latency_ms": int((time.time() - start_time) * 1000)
    }