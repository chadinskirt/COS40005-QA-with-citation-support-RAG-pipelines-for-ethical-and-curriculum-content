# API contract (v1.1)

Agreement between the frontend (React, Vinh) and the backend: the FastAPI gateway in `academic-advising-portal-api-gateway` (Vinh), Engine 1 behind `/api/recommend` (Thinh) and Engine 2 behind `/api/chat` (Minh Huy). The frontend runs against these shapes with a mock. If the backend returns them exactly, `VITE_USE_MOCK=false` connects the two.

[`openapi.yaml`](./openapi.yaml) is the machine-readable version. Change both files in the same PR.

## General rules

| Rule      | Detail                                                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base path | All endpoints are under `/api`. In dev the backend runs on `http://localhost:8000` and the Vite dev server proxies `/api` to it.                                                                               |
| Format    | JSON in and out, UTF-8, `snake_case` field names.                                                                                                                                                              |
| CORS      | Allow `http://localhost:5173` (Vite dev) and `http://localhost:4173` (Vite preview). The Vite proxy makes this unnecessary by default. It is required when `VITE_API_BASE_URL` points straight at the backend. |
| Privacy   | No name, email or student ID in any request. Do not write request bodies to disk. Keep session data in memory (Australian Privacy Principles 3 and 6).                                                         |
| Latency   | `POST /api/chat` and `POST /api/recommend` answer in under 3 s at p95. The frontend gives up after 15 s.                                                                                                       |
| Errors    | Every non-2xx response uses the error shape below.                                                                                                                                                             |

### Error shape

```json
{
  "error": {
    "code": "CURRICULUM_CYCLE",
    "message": "A circular prerequisite was found in the curriculum data.",
    "details": { "cycle": ["COS30018", "COS30019", "COS30018"] }
  }
}
```

| HTTP | `code`                | When                                                                              | What the UI shows                       |
| ---- | --------------------- | --------------------------------------------------------------------------------- | --------------------------------------- |
| 404  | `UNKNOWN_MAJOR`       | `major` id does not exist                                                         | System error banner                     |
| 404  | `NOT_FOUND`           | No route at that path                                                             | System error banner                     |
| 405  | `METHOD_NOT_ALLOWED`  | Route exists but not for that HTTP method                                         | System error banner                     |
| 409  | `CURRICULUM_CYCLE`    | The NetworkX cycle check fails. `details.cycle` lists the unit codes in the cycle | Curriculum data error (S6)              |
| 422  | `UNKNOWN_UNIT`        | A code in `completed_units` is not in the catalogue. `details.units` lists them   | System error banner                     |
| 422  | `VALIDATION_ERROR`    | Missing or malformed field, empty question                                        | System error banner                     |
| 503  | `SERVICE_UNAVAILABLE` | RAG model, vector store or graph not ready                                        | System error banner with Try again (S6) |
| 500  | `INTERNAL_ERROR`      | Anything else                                                                     | Same as 503                             |

For a 4xx the banner shows `message`, so write it for a student to read. For 5xx and 503 the banner shows a fixed "not responding" text.

FastAPI's default 422 body (`{"detail": [...]}`) has a different shape. Add an exception handler that converts it. The frontend maps a bare 422 to `VALIDATION_ERROR` and 502 to 504 to `SERVICE_UNAVAILABLE` as a fallback, but this error shape is the contract.

## Endpoints

### `GET /api/health`

For monitoring. The UI does not call it.

```json
{ "status": "ok", "version": "0.1.0", "engines": { "rag": "ok", "dag": "ok" } }
```

### `GET /api/majors`

The in-scope computing majors (3 to 4).

```json
{ "majors": [{ "id": "artificial-intelligence", "name": "Artificial Intelligence" }] }
```

`id` is a stable slug. The frontend sends it back in other requests.

### `GET /api/units?major={id}`

Units in the "Completed units" checklist for a major: foundation units plus major units.

```json
{ "units": [{ "code": "COS10009", "name": "Introduction to Programming", "credit_points": 12.5 }] }
```

### `POST /api/recommend` (Engine 1, Thinh)

Returns the recommended units for the student's major, grouped into semesters and ranked inside each semester. The frontend shows them under the Study profile form when the student presses Generate pathway.

Ranking rule:

1. Semesters follow prerequisites: a unit appears only after all its prerequisites are completed or placed in an earlier semester.
2. Inside a semester, the unit that unlocks more later units ranks higher. Unlocked units are the remaining required units that depend on it, directly or through other remaining units: `len(nx.descendants(G.subgraph(remaining), unit))` in NetworkX, where `remaining` is every required unit not in `completed_units`.
3. Ties follow the order of the major's course structure in the curriculum data.
4. If more units are eligible than fit in a semester (2 in the current mock), the higher-ranked ones go in and the rest move to a later semester or to `blocked_units`.

Request:

```json
{ "major": "artificial-intelligence", "completed_units": ["COS10009", "COS10004", "MAT10004", "COS20015"] }
```

Response 200:

```json
{
  "major": { "id": "artificial-intelligence", "name": "Artificial Intelligence" },
  "semesters": [
    {
      "index": 1,
      "name": "Semester 1",
      "credit_points": 25.0,
      "units": [
        {
          "code": "COS20007",
          "name": "Object Oriented Programming",
          "credit_points": 12.5,
          "rank": 1,
          "reason": "unlocks 5 later units"
        },
        {
          "code": "COS20019",
          "name": "Cloud Computing Architecture",
          "credit_points": 12.5,
          "rank": 2,
          "reason": "required for your major"
        }
      ]
    }
  ],
  "blocked_units": [
    {
      "code": "COS30049",
      "name": "Computing Technology Innovation Project",
      "credit_points": 12.5,
      "missing_prereqs": ["COS30019"],
      "available_after": "Semester 2"
    }
  ],
  "violations": 0,
  "completed_units": ["COS10009", "COS10004", "MAT10004", "COS20015"]
}
```

| Field               | Rule                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `semesters[].units` | Each unit's prerequisites are in `completed_units` or in an earlier semester. Sorted by `rank`, so the first element has `rank` 1.                                                                                                                                                                                              |
| `rank`              | Integer from 1 within each semester. Shown as the #1, #2 badge on the unit card.                                                                                                                                                                                                                                                |
| `reason`            | Short lowercase phrase shown after the credit points, for example `unlocks 5 later units` or `required for your major`.                                                                                                                                                                                                         |
| `blocked_units`     | Required units missing from `semesters`. `missing_prereqs` lists prerequisites not yet completed. `available_after` names the semester where the last missing prerequisite is planned. It is `null` when any missing prerequisite is not planned, and when `missing_prereqs` is empty (the unit was left out for lack of room). |
| `violations`        | Number of prerequisite breaks in the returned plan. Must be `0` (target: 0.0% violation rate). Above 0, the UI shows a red "check failed" banner.                                                                                                                                                                               |
| Empty plan          | When every unit is done, `semesters` and `blocked_units` are both `[]`.                                                                                                                                                                                                                                                         |

### `POST /api/chat` (Engine 2, Minh Huy)

Request:

```json
{
  "question": "What do I need to pass COS30019?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

`history` is optional: earlier turns of this session, oldest first. `question` is 1 to 500 characters.

Response 200, answered:

```json
{
  "answer": "You need an overall mark of at least 50% and must complete the hurdle task described in the unit outline [1].",
  "citations": [
    {
      "id": "chunk_0142",
      "doc": "COS30019 Unit Outline",
      "section": "§4 Assessment",
      "page": 6,
      "snippet": "…to pass this unit students must achieve an overall mark of 50% or more…",
      "similarity": 0.86,
      "url": "https://…/COS30019-unit-outline.pdf"
    }
  ],
  "abstained": false,
  "abstain_reason": null,
  "top_similarity": 0.86,
  "threshold": 0.7,
  "sources_checked": 5,
  "sources_passed": 1,
  "latency_ms": 1180
}
```

Response 200, abstained (similarity threshold not reached):

```json
{
  "answer": null,
  "citations": [],
  "abstained": true,
  "abstain_reason": "LOW_SIMILARITY",
  "top_similarity": 0.41,
  "threshold": 0.7,
  "sources_checked": 5,
  "sources_passed": 0,
  "latency_ms": 640
}
```

| Field                                       | Rule                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `abstained`                                 | `true` when no retrieved chunk reaches `threshold`. Then `answer` is `null` and `citations` is `[]`. Never return a generated answer with `abstained: true`. |
| `abstain_reason`                            | `LOW_SIMILARITY` (nothing close enough) or `OUT_OF_SCOPE` (topic outside the portal, such as credit transfer between universities). `null` when answered.    |
| `citations`                                 | Only chunks that were retrieved and passed the threshold. `id` is the ChromaDB chunk id, so each answer can be traced during evaluation.                     |
| `[n]` markers                               | `[1]` in `answer` is `citations[0]`, `[2]` is `citations[1]`, and so on.                                                                                     |
| `page`                                      | Integer, or `null` when the source has no page numbers.                                                                                                      |
| `url`                                       | Link to the full source document, or `null`. Feeds the "Open full document" button, which is disabled when `null`.                                           |
| `similarity`, `top_similarity`, `threshold` | Cosine similarity from 0 to 1. Two decimals is enough.                                                                                                       |
| `latency_ms`                                | Server-side time for the request, used in the latency evaluation.                                                                                            |

Abstention is a 200 response. Use the error shape only for failures.

## Gateway routes the UI does not call

The gateway also serves `GET /api/trends`. The Major trends page was removed from v1.1, so the frontend never calls it.

## Not in v1.1 (possible later additions)

- Streaming answers over server-sent events (`POST /api/chat/stream`). The UI shows a loading state, and streaming can be added without changing the fields above.
- Feedback on answers (`POST /api/feedback` with the chunk ids and a "wrong answer" flag) for error analysis.

## Checking the backend against the frontend

The steps are in the README, under "Connect to the backend". The check that matters most: ask "Can credits from another university count toward COS30019?" and expect an abstention, then stop the backend and expect the system error.

Until Engine 2 is plugged into the gateway, `/api/chat` returns 503 `SERVICE_UNAVAILABLE` and the chat shows the system error. This is expected at this stage, and nothing in the frontend needs to change for it.
