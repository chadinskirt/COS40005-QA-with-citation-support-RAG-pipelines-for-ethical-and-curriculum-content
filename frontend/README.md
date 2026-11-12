# Academic Advising Portal frontend (v1.1)

React and Vite implementation of the Figma design v1.1. It has two pages: Study profile, which holds the form and the recommended pathway below it, and Ask the syllabus, a chat that answers only from approved unit outlines and cites its sources.

## Run

You need Node.js 20 or 22 (LTS). Check with `node -v`.

```bash
git clone https://github.com/chadinskirt/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content.git
cd COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/frontend
npm install
cp .env.example .env       # Windows: copy .env.example .env
npm run dev
```

Open http://localhost:5173. Stop the server with `Ctrl + C`. After the first run, `npm run dev` is enough.

| Command                                   | What it does                                         |
| ----------------------------------------- | ---------------------------------------------------- |
| `npm run build`                           | Builds to `dist/`                                    |
| `npm run preview`                         | Serves the build on http://localhost:4173            |
| `npm run lint`                            | Runs ESLint                                          |
| `npm test` / `npm run test:watch`         | Runs the tests once, or re-runs them on every change |
| `npm run format` / `npm run format:check` | Writes or checks Prettier formatting                 |

## Mock data or real backend

`VITE_USE_MOCK` in `.env` picks the data source. Restart `npm run dev` after you edit `.env`.

| `.env`                             | Result                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `VITE_USE_MOCK=true`               | `src/api/mock.js` answers every call with sample data, and the top bar shows a "Demo data" badge.       |
| `VITE_USE_MOCK=false` (or not set) | The app calls the FastAPI backend through the Vite proxy at `BACKEND_URL` (default `localhost:8000`).   |

The proxy works for `npm run dev` and `npm run preview`. A production deployment needs its own reverse proxy for `/api`, and `VITE_*` values are fixed at build time.

Mock mode needs nothing else, so use it for UI work. In mock mode you can force two failures by adding a query string before the `#` and pressing Generate pathway: `?mock=down` gives a service error and `?mock=cycle` gives a curriculum data error. Example: `http://localhost:5173/?mock=cycle#profile`.

## Connect to the backend

The backend lives in `backend/` at the root of this repo. The frontend depends only on the endpoints in `docs/API_CONTRACT.md`, and the backend's responses must match `docs/openapi.yaml`.

The repo has no `requirements.txt` yet, so install the packages by hand. Python 3.11 or newer is fine.

```bash
# from the repo root
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy "psycopg[binary]" pandas networkx chromadb requests

docker compose up -d                 # starts Postgres on port 5432
cd backend
python seed_db.py                    # creates the tables and loads doc/Dataset
uvicorn main:app --port 8000
```

Then point the frontend at it:

1. In `frontend/.env`, set `VITE_USE_MOCK=false`. If the backend runs somewhere else, set `BACKEND_URL` too.
2. Restart `npm run dev`. The "Demo data" badge should be gone.
3. Open http://localhost:5173/api/majors. It should return JSON from the backend.
4. Pick a major and units, then press Generate pathway.
5. Ask "Can credits from another university count toward COS30019?". The answer must be an abstention.
6. Stop the backend and press Try again. The UI must show the system error, not an abstention.

The chat needs two extra things on the machine that runs the backend. ChromaDB downloads its embedding model (`all-MiniLM-L6-v2`) on the first query, so the machine needs internet access then. Answers are written by a local Ollama server at `localhost:11434` running `qwen3:8b`. Without the model download, `/api/chat` returns a 500. Without Ollama, the answer text becomes an error message instead of an abstention or a real answer.

The Vite proxy forwards `/api`, so the backend needs no CORS setup. CORS only matters if `VITE_API_BASE_URL` points straight at the backend.

| Symptom                                    | Likely cause                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| "Demo data" badge still shows              | `.env` still has `VITE_USE_MOCK=true`, or `npm run dev` was not restarted                  |
| "Could not reach the server"               | The backend is not running, or `BACKEND_URL` is wrong                                      |
| 404 on `/api/majors`                       | The backend routes are missing the `/api` prefix                                           |
| Generic error banner on a bad request      | The backend returns FastAPI's default 422 body instead of the one in the contract          |
| Pathway or chat fields missing or crashing | The response differs from the contract. Compare it with `docs/openapi.yaml`                |
| Every chat question shows the system error | The embedding model could not be downloaded, or the backend raised an exception            |
| `No module named 'psycopg'` on seeding     | SQLAlchemy 2.1 uses psycopg 3 for `postgresql://`. Install `psycopg[binary]`               |

## Backend contract

`docs/API_CONTRACT.md` holds the rules and examples. `docs/openapi.yaml` is the machine-readable version. Give both to whoever owns the backend. `src/api/client.js` has one function per endpoint the UI calls and is the only code that calls `fetch`. Runtime settings live in `src/config.js`.

For a rejected request (4xx), the system error banner shows the backend's `message`, for example the unknown unit codes. For a 5xx or a lost connection it shows the generic "service not responding" text.

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
| S1 Study profile with recommended pathway          | `pages/ProfilePage.jsx`, `components/PathwayResults.jsx`                                                |
| S3 grounded chat, S4 abstention                    | `pages/ChatPage.jsx`, `components/AssistantMessage.jsx`, `components/SidePanels.jsx`                    |
| S6 system states                                   | `components/States.jsx`, plus the empty and loading states in each page                                 |

The loading skeleton in S6 has four cards, one for each column of the results grid: three semesters and "Not eligible yet".

## Accessibility and layout

- Every interactive element has a visible keyboard focus ring (WCAG 2.4.7), and there is a skip link at the top of the page.
- Below 760 px the sidebar becomes a scrollable top nav. Below 1100 px the source panel moves under the chat.
- The unit counter uses `aria-live` and the chat thread uses `role="log"`. Animations stop when the user has `prefers-reduced-motion` set.

## Privacy

The app collects no name, email or student ID. The profile, plan and chat history live in React state and disappear when the tab closes. Nothing goes to localStorage or cookies.

## Tests

`npm test` runs the suite with Vitest, jsdom and Testing Library. It needs no backend and no `.env`.

- `src/api/client.test.js` runs the client against a fake `fetch` and checks request shapes, error mapping and the timeout.
- `src/api/mock.test.js` checks the mock plan (prerequisite order, ranks, errors) and the mock chat (citations, abstention).
- `src/state/*.test.jsx` cover `useRequest` and the shared app state.
- `src/App.test.jsx` covers hash routing, the tab title, and chat state surviving navigation.
- `src/pages/*.test.jsx` render each page with a mocked `api` and click through the main flows and error states.

To test against a real backend, follow "Connect to the backend".

## Known limits

- All data in `mock.js` is sample data: unit codes, prerequisites and passages.
- Answers are not streamed. See "Not in v1.1" in the contract.
