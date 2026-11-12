# Academic Advising Portal frontend (v1.1)

React + Vite implementation of the Figma design v1.1. Owner: Vinh.

Two pages: Study profile (the form, with the recommended pathway below it) and Ask the syllabus. The Pathway and Major trends pages were removed at the team's request.

## Run

Needs Node.js 20 or 22 (LTS). Check with `node -v`.

```bash
git clone https://github.com/chadinskirt/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content.git
cd COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/frontend
npm install
copy .env.example .env     # Mac/Linux: cp .env.example .env
npm run dev
```

Open http://localhost:5173 and stop with `Ctrl + C`. After the first run, `npm run dev` is enough.

| Command                                   | What it does                                         |
| ----------------------------------------- | ---------------------------------------------------- |
| `npm run build`                           | Builds to `dist/`                                    |
| `npm run preview`                         | Serves the build on http://localhost:4173            |
| `npm run lint`                            | Runs ESLint                                          |
| `npm test` / `npm run test:watch`         | Runs the tests once, or re-runs them on every change |
| `npm run format` / `npm run format:check` | Writes or checks Prettier formatting                 |

## Mock data or real backend

`VITE_USE_MOCK` in `.env` picks the data source. Restart `npm run dev` after editing `.env`.

| `.env`                             | Result                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `VITE_USE_MOCK=true`               | `src/api/mock.js` answers every call with sample data. The top bar shows a "Demo data" badge.                |
| `VITE_USE_MOCK=false` (or not set) | The app calls the FastAPI backend through the Vite proxy at `BACKEND_URL` (default `http://localhost:8000`). |

The proxy works for `npm run dev` and `npm run preview`. A production deployment needs its own reverse proxy for `/api`, and `VITE_*` values are fixed at build time.

## Connect to the backend

The backend is the FastAPI gateway in `academic-advising-portal-api-gateway`. The frontend depends only on the endpoints in `docs/API_CONTRACT.md`, and the gateway's Pydantic models follow `docs/openapi.yaml`.

1. Start the gateway (default `http://localhost:8000`). All routes start with `/api`.
2. In `.env`, set `VITE_USE_MOCK=false`. If the backend runs elsewhere, set `BACKEND_URL` to its address.
3. Restart `npm run dev`. The "Demo data" badge in the top bar should be gone.
4. Open http://localhost:5173/api/majors. It should return JSON from the backend.
5. Walk through the flow: pick a major and units, press Generate pathway, then ask "Can credits from another university count toward COS30019?". The answer must be an abstention. Stop the backend and press Try again: the UI must show the system error, not an abstention. Until Minh Huy's RAG engine is connected, the gateway answers `/api/chat` with 503, so every question shows the system error. The abstention check can only pass after that.

The Vite proxy forwards `/api`, so the backend needs no CORS setup. CORS is only required if `VITE_API_BASE_URL` points straight at the backend.

| Symptom                                    | Likely cause                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| "Demo data" badge still shows              | `.env` still has `VITE_USE_MOCK=true`, or `npm run dev` was not restarted                       |
| "Could not reach the server"               | Backend is not running, or `BACKEND_URL` is wrong                                               |
| 404 on `/api/majors`                       | Backend routes are missing the `/api` prefix                                                    |
| Generic error banner on a bad request      | Backend returns FastAPI's default 422 body; add the exception handler described in the contract |
| Pathway or chat fields missing or crashing | Response differs from the contract; compare it with `docs/openapi.yaml`                         |

Demo switches (mock mode only): add `?mock=down` (service error) or `?mock=cycle` (curriculum data error) before the `#`, then press Generate pathway. Example: `http://localhost:5173/?mock=cycle#profile`.

## Backend contract

`docs/API_CONTRACT.md` holds the rules and examples, and `docs/openapi.yaml` the machine-readable version. Give both to the backend owner. `src/api/client.js` has one function per endpoint the UI calls and is the only code that calls `fetch`. Runtime settings live in `src/config.js`.

## Figma to code

| Figma                                              | Code                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Variables (Semantic, Dimensions)                   | `src/styles/tokens.css`, same names (for example `--color-bg-brand`)                                    |
| Text styles                                        | `.t-display`, `.t-h1`, `.t-h2`, `.t-body`, `.t-small`, `.t-label`, `.t-caption` in `src/styles/app.css` |
| Button (Type)                                      | `components/Button.jsx`, `variant="primary\|secondary\|ghost\|warning"`                                 |
| MajorChip, CitationChip                            | `components/Chips.jsx`                                                                                  |
| UnitSelect (Checked)                               | `components/UnitSelect.jsx` (a real checkbox)                                                           |
| UnitCard (Status, Rank)                            | `components/UnitCard.jsx`, `status="planned\|completed\|blocked"`; `rank` shows the #n badge            |
| Banner (Tone)                                      | `components/Banner.jsx`, `tone="success\|warning\|danger\|info"`                                        |
| App/TopBar and App/Sidebar                         | `components/Shell.jsx`                                                                                  |
| S1 Study profile with recommended pathway (was S2) | `pages/ProfilePage.jsx`, `components/PathwayResults.jsx`                                                |
| S3 grounded chat, S4 abstention                    | `pages/ChatPage.jsx`, `components/AssistantMessage.jsx`, `components/SidePanels.jsx`                    |
| S6 system states                                   | `components/States.jsx`, plus the empty and loading states in each page                                 |

## Differences from Figma v1.1

- Under the abstention buttons (S4), Figma says "This is a deliberate abstention, not a system error." The app says "The portal answers only when an approved document supports the answer." The Figma line reads like a design note, and most students would not know what an abstention is.
- The loading skeleton (S6) shows four cards, one per column of the results grid (three semesters and "Not eligible yet"). Figma shows three in a narrower frame.
- For a rejected request (4xx) the system error banner shows the backend's `message`, for example the unknown unit codes. Figma only shows the "service down" text.

## Added beyond Figma v1.1

- Visible keyboard focus ring (WCAG 2.4.7), hover states on buttons and chips, and a skip link.
- Responsive layout: below 760 px the sidebar becomes a scrollable top nav; below 1100 px the source panel moves under the chat.
- `aria-live` on the unit counter and `role="log"` on the chat thread. `prefers-reduced-motion` is respected.

## Privacy

The app collects no name, email or student ID. The profile, plan and chat history live in React state and disappear when the tab closes. Nothing goes to localStorage or cookies.

## Tests

`npm test` runs the suite with Vitest, jsdom and Testing Library. It needs no backend and no `.env`:

- `src/api/client.test.js` runs the client against a fake `fetch`: request shapes, error mapping, timeout.
- `src/api/mock.test.js` checks the mock plan (prerequisite order, ranks, errors) and chat (citations, abstention).
- `src/state/*.test.jsx` cover `useRequest` and the shared app state.
- `src/App.test.jsx` covers hash routing, the tab title and chat state surviving navigation.
- `src/pages/*.test.jsx` render each page with a mocked `api` and click through the main flows and error states.

To check a real backend, follow "Connect to the backend".

## Known limits

- All data in `mock.js` is sample data (unit codes, prerequisites, passages).
- Answers are not streamed (see "Not in v1.1" in the contract).
