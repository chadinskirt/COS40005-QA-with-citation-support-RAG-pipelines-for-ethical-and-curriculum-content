# Figma v1.2: what the frontend will need from the backend

The frontend is written first, from Figma v1.2. The backend follows. [API_CONTRACT.md](./API_CONTRACT.md) and [openapi.yaml](./openapi.yaml) describe what the frontend sends and reads. This note compares v1.2 with the backend as it is today (`backend/main.py`, `backend/rag_engine.py`, `service/recommender.py`) so the team can plan the work.

## Where things stand after the v1.2 frontend

- Works with today's backend: Plan semester (`POST /api/recommend` with passed, failed and enrolled units and the load) and Ask (`POST /api/chat`).
- Done in the frontend, so items 1, 2 and 4 below are optional for the backend: terms (January, May, September) and the graduation term, when a waiting unit becomes available, unlock counts, Core/Major/Elective badges, the prerequisite re-check and swaps. All come from `semesters` and `dag_graph.edges`.
- Grades (item 5) are kept on the student's device and only used for the WAM estimate, or sent to the chat when "Past grades" is on.
- The chat no longer sends `student_id`. It sends `scope` and, when "My plan" is on, a `plan` object (major, passed, failed and enrolled units, load, start term, and grades if allowed). Pydantic ignores these fields today, so the answer does not use the plan until `ChatRequest` reads `plan` and `_build_student_context` uses it instead of the `students` table.
- When Ollama is down, `/api/chat` returns HTTP 200 with "LLM connection failed..." as the answer. The frontend shows this as a service error. Returning 503 with the error shape would be cleaner.
- Figma's empty plan lists COS10009, COS10026 and TNE10006 as a core first semester. `/recommend` only plans the major's units, so the page lists the first semester the planner returns for an empty profile instead, under "Use this semester".
- Still needed from the backend: item 6 (`POST /api/plans`), item 7 (page, outline date and quote in citations), items 8 to 11 for the richer chat, and 12 and 13 for the pages built later.

## Already in the backend, and the design uses it as is

- `units_per_semester` defaults to 3. The design's standard load is 3 units.
- `failed_units` puts retakes first and marks them `is_retake` / "Retake Required". The design shows them with a Retake badge.
- `enrolled_units` counts toward prerequisites.
- The `dag_graph` node statuses are `passed`, `enrolled`, `retake`, `blocked` and `planned`. The design's prerequisite path uses Passed, Retake and Planned.
- Chat answers already ask the model for Markdown tables and Mermaid prerequisite diagrams. The "rich answer" screen renders exactly these.
- The chat abstains with `LOW_SIMILARITY` and `UNIT_NOT_FOUND`.

## Changes the design needs

| #   | Screen                       | Today                                                         | v1.2 needs                                                                                                                                                                                                                                                |
| --- | ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plan semester                | `semesters[].name` is "Semester 1", "Semester 2"…             | Calendar terms. The campus runs January, May and September. Accept a `start_term` such as `{"month": "Jan", "year": 2027}` and return `term` on each semester, so the UI can show "January 2027" and the earliest graduation.                             |
| 2   | Plan semester                | `blocked_units[].available_after` is always `null`            | The term in which the last missing prerequisite is planned, e.g. "May 2027".                                                                                                                                                                              |
| 3   | Plan semester                | `units_per_semester` is accepted silently                     | Keep 3 as the default. The UI warns that 2 or 4 needs approval from the Academic Office, so no backend check is needed.                                                                                                                                   |
| 4   | Plan semester                | `reason` is one sentence                                      | Also return `unlocks` (number of later units) and `category` (`core`, `major`, `elective`) so the UI can show badges and its own wording.                                                                                                                 |
| 5   | Plan semester, Plan review   | The profile stores passed, failed and enrolled units only     | An optional grade per passed unit (HD, D, C, P) for WAM and "Passed · HD".                                                                                                                                                                                |
| 6   | Plan review, sidebar         | Profiles are keyed by integer `student_id`                    | Plans are shared by a short code (e.g. `A7-3K`) that carries no name or student ID: `POST /api/plans` returns the code, `GET /api/plans/{code}` returns the plan with a rule check per unit and the source for each check.                                |
| 7   | Ask, Unit outline            | Citations are `{source_file, text_snippet, similarity_score}` | `{doc, section, page, quote, url, outline_date}`. `page` and `outline_date` drive "Open at page 6" and the "2025 outline" badge. `[n]` in the answer maps to `citations[n-1]`.                                                                            |
| 8   | Ask                          | No reasoning data beyond counts                               | Keep `sources_checked`, `sources_passed` and `latency_ms`. Optionally add `steps: [{label}]` for the "Reasoning done" panel.                                                                                                                              |
| 9   | Ask                          | No clarifying questions                                       | When a question is ambiguous ("the AI unit"), return `needs_clarification: true` with `options: [{code, name, note}]` and no answer.                                                                                                                      |
| 10  | Ask                          | No scope control                                              | Accept `scope: ["outlines", "plan", "grades"]` from the composer chips. "Past grades" is off unless the student turns it on.                                                                                                                              |
| 11  | Ask                          | No `OUT_OF_SCOPE`                                             | Return `OUT_OF_SCOPE` for topics outside the outlines, such as credit transfer. The UI shows a different card from a service error.                                                                                                                       |
| 12  | Explore majors (build later) | Only `GET /api/majors`                                        | `POST /api/majors/match` with interests, career goals and assessment style. Returns ranked majors with a fit label (Strong, Good, Partial, Low), the number of choices matched, a reason with citations, careers and key units.                           |
| 13  | Unit outline (build later)   | No unit detail endpoint                                       | `GET /api/units/{code}` with summary, learning outcomes, assessment tasks (task, who, weight, due), hurdle requirements, requisites, contact hours, outline date and citations. The data already exists in `doc/Dataset/cleaned_structured_syllabi.json`. |

## Data the design was checked against

COS30019 details on the Unit outline and rich-answer screens come from the January 2026 outline. Pre-requisites: COS20007 **or** COS30008. Assessment: research report 20%, group project 50% in three parts, final questionnaire 30%. No hurdle requirements. 48 contact hours. Advisor review data comes from the COS20007 (May 2025), COS30018 (May 2026) and STA10003 (January 2025) outlines.

The outlines are marked "protected and may not be shared, uploaded, or distributed". The design shows short excerpts drawn as text. It does not contain images of the PDF pages.
