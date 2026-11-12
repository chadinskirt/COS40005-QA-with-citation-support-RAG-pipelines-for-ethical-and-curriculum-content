# Academic Advising Portal — Citation-Supported RAG & Curriculum Recommender

A full-stack academic advising platform combining a **citation-backed Retrieval-Augmented Generation (RAG) chatbot** for university unit outlines with a **DAG-based curriculum recommender** for multi-semester study planning.

---

## Architecture & Tech Stack

* **Frontend (`frontend/`):** React + Vite single-page application communicating with the backend via `/api` proxy[cite: 9, 10].
* **Backend (`backend/`):** FastAPI REST API (`uvicorn`) serving the RAG Q&A engine (`/api/chat`), study plan generator (`/api/recommend`), and major trends (`/api/trends`)[cite: 5, 6, 10].
* **RAG Engine (`backend/rag_engine.py`):** ChromaDB persistent vector store (`doc/chroma_db`) with metadata filtering by unit code, paired with local **Ollama (`qwen2.5:3b`)** for grounded, citation-supported answers[cite: 11].
* **Curriculum Recommender (`service/recommender.py`):** Directed Acyclic Graph (DAG) scheduler built with NetworkX and SQLAlchemy, enforcing `AND`, `OR`, and `ASSUMED` prerequisite rules[cite: 7, 8, 12].
* **Database (`postgres`):** PostgreSQL 16 storing courses, prerequisite edges, catalogue mappings, and student profiles[cite: 10, 12].

---

## Project Structure

```text
├── backend/
│   ├── main.py              # FastAPI routes & exception handlers
│   └── rag_engine.py        # ChromaDB retrieval & Ollama LLM integration
├── doc/
│   ├── Dataset/             # cleaned_structured_syllabi.json & Course_Prerequisites.csv
│   └── chroma_db/           # Persistent ChromaDB vector store
├── frontend/                # React + Vite web interface
├── service/
│   ├── models.py            # SQLAlchemy ORM models & PostgreSQL connection
│   ├── recommender.py       # NetworkX DAG prerequisite scheduler
│   └── seed_db.py           # Database seeding script
├── ingest_json.py           # Cleans, chunks, and indexes syllabi & prerequisites into ChromaDB
├── Dockerfile.backend       # FastAPI backend container image
├── frontend/Dockerfile      # Vite frontend container image
├── docker-compose.yaml      # Multi-container orchestration (Postgres, Backend, Frontend)
└── requirements.txt         # Python dependencies
```

---

## Prerequisites

1. **Ollama** installed on the host machine with the `qwen2.5:3b` model pulled[cite: 11]:
   ```bash
   ollama pull qwen2.5:3b
   ```
   > **Linux Docker Networking:** If running the backend inside Docker, ensure Ollama listens on `0.0.0.0:11434` so containers can reach it via `host.docker.internal:11434`:
   > ```bash
   > OLLAMA_HOST=0.0.0.0 ollama serve
   > ```
2. **If running with Docker:** Docker Engine and Docker Compose plugin (`docker compose`).
3. **If running without Docker:** Python 3.12+, Node.js 20+, and a running PostgreSQL 16 instance (`academic_advising` database)[cite: 10].

---

## Quick Start (With Docker)

1. **Build and launch all services** (PostgreSQL, FastAPI backend, and React frontend)[cite: 10]:
   ```bash
   docker compose up --build -d
   ```

2. **Seed PostgreSQL & ingest ChromaDB** (first-time setup or whenever `doc/Dataset/` changes):
   ```bash
   docker compose exec backend python service/seed_db.py
   docker compose exec backend python ingest_json.py
   docker compose restart backend
   ```

3. **Open the application:**
   * **Frontend Portal:** `http://localhost:5173`
   * **Swagger API Docs:** `http://localhost:8000/docs`

4. **Stop all containers:**
   ```bash
   docker compose down
   ```
   *(PostgreSQL data persists in the `pgdata` Docker volume, and ChromaDB embeddings persist in `./doc/chroma_db`[cite: 10, 11].)*

---

## Quick Start (Without Docker)

1. **Start PostgreSQL** (ensure a database named `academic_advising` exists with credentials `postgres:postgres` on port `5432`, or export `DATABASE_URL`)[cite: 10, 12]:
   ```bash
   export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/academic_advising"
   export OLLAMA_BASE_URL="http://localhost:11434"
   ```

2. **Set up the Python environment and install dependencies:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate        # Bash/Zsh
   # source .venv/bin/activate.fish # Fish shell
   pip install -r requirements.txt
   ```

3. **Seed PostgreSQL and build the ChromaDB vector store:**
   ```bash
   python service/seed_db.py
   python ingest_json.py
   ```

4. **Start the FastAPI backend:**
   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. **In a second terminal, start the React/Vite frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

6. **Access the app:** Open `http://localhost:5173` (frontend) or `http://localhost:8000/docs` (API docs).

---

## API Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/chat` | Ask natural-language questions about unit summaries, assessments, hurdles, and prerequisites with cited syllabus snippets[cite: 1, 5, 6]. |
| `POST` | `/api/recommend` | Generate a multi-semester study plan based on `major` and `completed_units`, respecting `AND`, `OR`, and `ASSUMED` prerequisite rules[cite: 3, 6, 7, 8]. |
| `GET` | `/api/trends` | Retrieve major-level industry skill trends with supporting citations[cite: 6]. |

---

## Example Requests

### 1. Ask a Unit Question (`POST /api/chat`)

```bash
curl -X POST "http://localhost:8000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the prerequisites and unit summary of COS40005?",
    "history": []
  }'
```

### 2. Generate a Study Plan (`POST /api/recommend`)

```bash
curl -X POST "http://localhost:8000/api/recommend" \
  -H "Content-Type: application/json" \
  -d '{
    "major": "artificial-intelligence",
    "completed_units": [
      "COS10009",
      "COS10022",
      "TNE10006"
    ]
  }'
```
