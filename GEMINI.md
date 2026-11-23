# Project Context & Agent Guidelines — Academic Advising Portal (COS40005)

## 1. Architecture & Stack
- **Database:** PostgreSQL 16 + `pgvector` (`academic_advising`), managed via SQLAlchemy (`service/models.py`).
- **Backend (`backend/`, `service/`):** FastAPI v2.0 (`http://localhost:8000`), RAG engine (`backend/rag_engine.py`) with `all-MiniLM-L6-v2` embeddings and local Ollama (`qwen2.5:3b`), and DAG-based study plan recommender (`service/recommender.py`).
- **Frontend (`frontend/`):** Vite + React (`http://localhost:5173`), plain CSS (`frontend/src/styles/app.css`), KaTeX math rendering (`\[...\]`, `\(...\)`, `$$...$$`, `$...$`), Mermaid flowchart rendering, interactive SVG prerequisite DAG (`DagGraph.jsx`), and Vitest + React Testing Library (`*.test.jsx`).

## 2. Default Active Skills
- **`ponytail`:** Keep changes minimal, direct, and free of speculative abstractions or unnecessary files.
- **`superpowers`:** For multi-file features or refactors, follow **Brainstorm -> Plan -> Write/Update Tests -> Implement -> Verify**.
- **`headroom`:** Summarize verbose `pytest`, `npm test`, and build outputs instead of dumping raw logs into context.
- **`find-skills` / `omniroute`:** Available on demand for discovering extra skills or configuring LLM routing/failover.

## 3. Live Backend API Contracts (FastAPI v2.0)
- `GET /api/majors` -> `{ majors: [{ id: string, name: string }] }`
  - Canonical 5 Computer Science majors:
    - `artificial-intelligence` (**Artificial Intelligence**)
    - `data-science` (**Data Science**)
    - `software-development` (**Software Development**)
    - `internet-of-things` (**Internet of Things**)
    - `cyber-security` (**Cybersecurity**)
- `GET /api/units?major={major_id}` -> `{ units: [{ code: string, name: string, credit_points: number }] }`
- `GET /api/students/{student_id}` -> `{ student_id, major_code, target_career, study_goal, passed_units, failed_units, enrolled_units }` (`404` if new)
- `PUT /api/students/{student_id}` -> accepts `{ major_code, target_career?, study_goal?, passed_units, failed_units, enrolled_units }`
- `POST /api/students/{student_id}/plan` -> accepts `{ major_override?: string, units_per_semester?: number }`, returns `{ major, semesters, blocked_units, violations, completed_units, failed_units, enrolled_units, dag_graph: { nodes: [{ id, label, status }], edges: [{ source, target, rule_type }] } }` where `status` is `"passed" | "enrolled" | "retake" | "planned" | "blocked"`.
- `POST /api/chat` -> accepts `{ question, history, student_id?: number }`, returns `{ answer, citations, abstained, abstain_reason, top_similarity, threshold, sources_checked, sources_passed, latency_ms }`.

## 4. Curriculum Taxonomy & Strict Closed-World Grounding
- **Never hallucinate unseeded units:** Both `backend/rag_engine.py` and `frontend/` must strictly stick to courses present in PostgreSQL (`courses` table / `GET /api/units`). Never invent course codes (e.g., `COSC10006`) or include unseeded external codes (e.g., `ENGR10007`) in Mermaid diagrams or unit selectors.
- **Swinburne Bachelor of Computer Science Unit Grouping (`frontend/src/data/csMajors.js`):**
  - **Core Units (`Core`):** `COS10004`, `COS10009`, `COS10025`, `COS10026`, `TNE10006`, `COS20007`, `COS40005`, `COS40006`.
  - **Artificial Intelligence Major (`Major` / `MJ-AIV`):** `COS20019`, `COS20031`, `COS30018`, `COS30019`, `COS30049`, `COS30082`, `SWE30003`, `COS40007`.
  - **Elective / Choice Units (`Elective`):** `LAW20019`, `COS40003`, `MDA10018`, `STA10003`, `COS10022`, `MTH10013`, plus any remaining seeded units not in `Core` or the active `Major`.

## 5. Agentic Closed-Loop Execution Protocol
Operate in a strict **Plan -> Edit -> Verify -> Self-Correct** loop. Do NOT stop or ask for confirmation until all verification gates pass with exit code `0` (max 5 self-correction iterations per subtask):
1. **Frontend changes (`frontend/`):**
   ```bash
   cd frontend && npm test -- --run && npm run lint && npm run build
   ```
2. **Backend / Service changes (`backend/`, `service/`):**
   ```bash
   .venv/bin/pytest -q
   ```
3. **Database Ingestion / Docker Verification (when containers are active):**
   - Ingest newly added archive files idempotently via `service/seed_db.py`.
   - Rebuild changed containers (`docker compose up -d --build backend frontend`) and smoke-test `GET /api/majors` and `GET /api/units`.
