# Changelog

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
