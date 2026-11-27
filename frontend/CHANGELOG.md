# Changelog

## 1.2.0

Matches Figma design v1.2 (Home, Plan semester and Ask the assistant, desktop and 390 px mobile, system states).

- New look from the v1.2 foundations: neutral surfaces, one navy accent, violet only for sources; Newsreader for titles and quotes, IBM Plex Mono for unit codes. Dark mode is gone because the design has none.
- Sidebar with unit search (Ctrl K), the five pages, and "Saved on this device only". Explore majors and Unit outlines show a "coming next" page.
- Home: ask straight away or pick first-year or current student.
- Plan semester replaces Study profile and the First-Year / Current Student switch. Terms are January, May and September; Load is 2, 3 or 4 units, with an approval warning off 3. Shows credit points, an estimated WAM from optional grades, units left and the earliest graduation; retakes first and one critical-path unit; reasons in plain words; prerequisite rules per unit; swaps that keep every rule; the prerequisite path; units not yet eligible with the term they open; the road to graduation with electives filling free slots; CSV export. The student ID lookup is gone: the plan is saved in the browser on Save plan, and Share with advisor asks the backend for a plan code.
- Ask the assistant: agent steps, Markdown answers with clickable [n] sources, a sources panel (drawer below 1280 px), tables with unit-code chips and a share-of-mark bar, the prerequisite map coloured from the student's plan, outline excerpts, a clarifying question, and separate cards for out of scope, weak match, unknown unit and service error with an error ID. Scope chips send the plan and grades only when the student turns them on.
- The client reads both the v1.2 citation shape and the backend's current one, and treats the backend's "LLM connection failed" text as a service error. The timeout is now 65 s to fit the backend's 60 s LLM limit.
- The mock follows `doc/Dataset` and the backend planner, with a sample student for demos.
- Fixed: a question sent from Home could be sent again on every render.
- Docs: API contract and OpenAPI for v1.2, and `docs/BACKEND_HANDOFF.md` with what the backend still needs.

## 1.1.0

Matches Figma design v1.1.

- Study profile page: pick a major, tick completed units, and get a recommended pathway below the form. Each plan shows a prerequisite check, ranked units per semester and blocked units with what they are missing.
- Ask the syllabus page: answers with numbered citations, a source panel, and an abstention state that explains why nothing was answered.
- System states: service error with retry, and curriculum data error for circular prerequisites.
- API client for `/majors`, `/units`, `/recommend` and `/chat`, following `docs/API_CONTRACT.md`. Mock data runs the app without a backend, with `?mock=down` and `?mock=cycle` demo switches.
- Keyboard focus ring, skip link, responsive layout, per-page tab titles.
- ESLint, Prettier and a Vitest suite.
- Removed the Pathway and Major trends pages at the team's request.

Final review fixes:

- Mock `available_after` is now `null` when any missing prerequisite is not planned, the same rule as the gateway. A test checks it for every major and every set of completed foundation units.
- The system error banner shows the backend's message for 4xx errors instead of "The service is not responding".
- The contract documents the gateway's unlock count (`descendants` in the subgraph of remaining units), the `NOT_FOUND` and `METHOD_NOT_ALLOWED` codes, `/api/trends` (not called by the UI) and the expected 503 from `/api/chat` until Engine 2 is connected.
- The loading skeleton has three lines, as in Figma S6.
- Removed the `act(...)` warnings from the test run.
