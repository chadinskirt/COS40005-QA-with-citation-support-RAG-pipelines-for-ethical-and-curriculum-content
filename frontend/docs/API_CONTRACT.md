# API contract (v1.2)

What the frontend sends and expects. It matches Figma v1.2 and the FastAPI backend in `backend/main.py`. Where the backend does not support a field yet, the frontend still works and the gap is listed in [BACKEND_HANDOFF.md](./BACKEND_HANDOFF.md). [`openapi.yaml`](./openapi.yaml) is the machine-readable version. Change both files in the same PR.

## General rules

| Rule      | Detail                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base path | Everything is under `/api`. In dev the backend runs on `http://localhost:8000` and Vite proxies `/api` to it.                                                    |
| Format    | JSON in and out, UTF-8, `snake_case` fields.                                                                                                                     |
| Privacy   | No name, email or student ID in any request. The plan is kept in the browser (localStorage) only after the student presses Save plan.                            |
| Timeout   | The frontend gives up after 65 s, because the backend allows the local LLM 60 s per answer.                                                                      |
| Errors    | Non-2xx responses use the error shape below. FastAPI's default `{"detail": ...}` is also read: 422 becomes `VALIDATION_ERROR`, 502 to 504 `SERVICE_UNAVAILABLE`. |

### Error shape

```json
{
  "error": {
    "code": "CURRICULUM_CYCLE",
    "message": "A circular prerequisite was found.",
    "details": { "cycle": ["COS30018", "COS30019", "COS30018"] }
  }
}
```

| HTTP    | `code`               | What the UI shows                                                       |
| ------- | -------------------- | ----------------------------------------------------------------------- |
| 409     | `CURRICULUM_CYCLE`   | "The course data has a loop" card with the units from `details.cycle`   |
| 4xx     | any                  | Service error card with the backend's `message`                         |
| 5xx / 0 | any, `NETWORK_ERROR` | "We couldn't reach the advising service" with Try again and an error ID |

## `GET /api/majors`

```json
{ "majors": [{ "id": "artificial-intelligence", "name": "Artificial Intelligence" }] }
```

## `GET /api/units?major={id}`

```json
{ "units": [{ "code": "COS10009", "name": "Introduction to Programming", "credit_points": 12.5 }] }
```

Used by the unit search in the sidebar, the Edit my units dialog and the roadmap. The frontend groups units into Core, Major and Elective with `src/data/csMajors.js`.

## `POST /api/recommend`

Plan semester calls this whenever the units or the load change.

```json
{
  "major": "artificial-intelligence",
  "completed_units": ["COS10009", "COS10026"],
  "failed_units": ["COS20007"],
  "enrolled_units": [],
  "units_per_semester": 3
}
```

The response is what `service/recommender.py` returns today: `major`, `semesters[].units[]` (`code`, `name`, `credit_points`, `rank`, `is_retake`, `reason`), `blocked_units`, `violations`, `completed_units`, `failed_units`, `enrolled_units` and `dag_graph` (`nodes`, `edges[]` with `source`, `target`, `rule_type`).

The frontend uses `dag_graph.edges` to check the plan again, explain each unit, list swaps that keep every rule, and draw the prerequisite path. Only `AND` and `OR` rules gate enrolment, the same as the backend; `ASSUMED` is shown as assumed knowledge. Semester 1 is the term picked in "Planning" (January, May or September). Free slots are filled with electives until the degree reaches 300 credit points.

## `POST /api/chat`

```json
{
  "question": "Can I take COS30019 next semester?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "scope": ["outlines", "plan"],
  "plan": {
    "major": "artificial-intelligence",
    "completed_units": ["COS10009"],
    "failed_units": ["COS20007"],
    "enrolled_units": [],
    "units_per_semester": 3,
    "start_term": "January 2027",
    "grades": { "COS10009": "HD" }
  }
}
```

`scope` comes from the chips under the question box. `plan` is sent only when "My plan" is on and the student has a plan; `grades` only when "Past grades" is on.

Answered:

```json
{
  "answer": "Not yet. COS30019 needs COS20007 or COS30008 [1]. ...",
  "citations": [
    {
      "doc": "COS30019 Unit Outline",
      "section": "Requisites",
      "page": 2,
      "outline_date": "Jan 2026",
      "quote": "Pre-requisites: COS20007 Object Oriented Programming OR COS30008 Data Structures and Patterns",
      "url": "https://.../COS30019.pdf#page=2"
    }
  ],
  "steps": [{ "label": "Read your plan" }, { "label": "Searched 3 unit outlines", "detail": "Read pages 2, 6 and 7" }],
  "abstained": false,
  "abstain_reason": null,
  "sources_checked": 5,
  "sources_passed": 3,
  "latency_ms": 2100
}
```

| Field                 | Rule                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answer`              | Markdown. Headings, lists, tables, `>` quotes, KaTeX maths and ` ```mermaid ` flowcharts are rendered. `[n]` opens `citations[n-1]`.                                 |
| `citations`           | v1.2 shape above. Today's backend shape (`source_file`, `text_snippet`, `similarity_score`) is still read and shown without page or date.                            |
| `citations[].table`   | Optional `{ head, rows, highlight }`: the table on that outline page. Shown under "From the unit outline".                                                           |
| `steps`               | Optional. Without it the UI shows the counts it always gets: passages checked and matched.                                                                           |
| `needs_clarification` | Optional. With `options: [{ code, name, note }]` and the question in `answer`, the UI asks which unit is meant and sends "Yes, CODE Name" back.                      |
| `abstained`           | `true` with `abstain_reason`: `OUT_OF_SCOPE` (topic outside the outlines), `LOW_SIMILARITY` (closest passage may be in `citations`), `UNIT_NOT_FOUND`.               |
| Tables                | A column whose cells are all percentages adding up to 100 also gets a "Share of the final mark" bar. A first cell starting with a unit code shows it as a code chip. |

Abstention is a 200 response. An answer that starts with `LLM connection failed` is treated as a service error, because the backend returns that text with HTTP 200 when Ollama is down.

## `POST /api/plans` (not in the backend yet)

Share with advisor saves the plan on this device and asks for a short code.

```json
{
  "major": "artificial-intelligence",
  "units": { "COS10009": { "status": "passed", "grade": "HD" } },
  "start": "2027-0",
  "load": 3,
  "swaps": [["COS20031", "COS30018"]]
}
```

`swaps` lists the unit pairs the student swapped, in order, so the advisor sees the same semesters. Response: `{ "code": "A7-3K" }`. The plan carries no name or student ID. Until the endpoint exists the dialog says sharing is not available on this server yet.
