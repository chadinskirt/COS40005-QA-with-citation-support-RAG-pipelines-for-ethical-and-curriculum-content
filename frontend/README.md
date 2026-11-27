# Academic Advising Portal frontend (v1.2)

React and Vite implementation of the Figma design v1.2 (`AcademicAdvisingPortal_Frontend_v1.2`). The v1.2 scope is three pages:

- **Home**: ask a question straight away, or pick "I haven't chosen a major" or "I'm planning next semester".
- **Plan semester**: the units for the next term (January, May or September), checked against every prerequisite, with retakes first, swaps that keep the rules, the prerequisite path, units not yet eligible and the road to graduation.
- **Ask the assistant**: answers from the approved unit outlines with numbered sources, a clarifying question when a question is vague, and different cards for "the outlines don't cover this", a weak match and a service error.

Explore majors and Unit outlines are designed in Figma but built later. Their sidebar links open a short page that says so.

## Design

The Figma file has three pages. You need access to the file to open them.

- [01 Cover, Product brief & Foundations](https://www.figma.com/design/WnhLHGGmjhhNtEum97z9rq/AcademicAdvisingPortal_Frontend_v1.2?node-id=0-1): scope, colours, type and breakpoints
- [02 Components](https://www.figma.com/design/WnhLHGGmjhhNtEum97z9rq/AcademicAdvisingPortal_Frontend_v1.2?node-id=1-2): buttons, badges, source cards, the sidebar
- [03 Screens](https://www.figma.com/design/WnhLHGGmjhhNtEum97z9rq/AcademicAdvisingPortal_Frontend_v1.2?node-id=1-3): every page on desktop and mobile, plus the system states

"Figma to code" below says which file builds each part.

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

| `.env`                             | Result                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `VITE_USE_MOCK=true`               | `src/api/mock.js` answers every call. The sidebar shows a "Demo data" badge.                          |
| `VITE_USE_MOCK=false` (or not set) | The app calls the FastAPI backend through the Vite proxy at `BACKEND_URL` (default `localhost:8000`). |

The mock uses the real units and prerequisites from `doc/Dataset` and the same planning rules as `service/recommender.py`. On an empty Plan semester page, "Demo data: load a sample student" fills in an AI student with eight units passed and COS20007 to retake. Try these questions: "Can I take COS30019 next semester?", "How do I pass the AI unit?", "Compare Data Science and AI", "Can credits from another university count toward COS30019?" (out of scope) and "What is COS49999?" (unknown unit).

Two switches go in the query string, before the `#`: `?mock=down` makes every call fail like a stopped server, and `?mock=cycle` makes planning fail with a curriculum loop. Example: `http://localhost:5173/?mock=down#ask`.

## Connect to the backend

The backend lives in `backend/` at the root of this repo. The frontend depends only on the endpoints in `docs/API_CONTRACT.md`, and the backend's responses must match `docs/openapi.yaml`.

The root `README.md` has the full setup. In short, from the repo root:

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

docker compose up -d postgres        # Postgres with pgvector on port 5432
python service/seed_db.py            # creates the tables and loads doc/Dataset
uvicorn backend.main:app --port 8000
```

Then point the frontend at it:

1. In `frontend/.env`, set `VITE_USE_MOCK=false`. If the backend runs somewhere else, set `BACKEND_URL` too.
2. Restart `npm run dev`. The "Demo data" badge should be gone.
3. Open http://localhost:5173/api/majors. It should return JSON from the backend.
4. On Plan semester, press Add my units, mark a few units and save. The plan appears below.
5. Ask "Can credits from another university count toward COS30019?". The answer must be an abstention.
6. Stop the backend and press Try again. The UI must show the system error, not an abstention.

The chat needs two extra things on the machine that runs the backend. The embedding model (`all-MiniLM-L6-v2`) is downloaded on first use, so the machine needs internet access then. Answers are written by a local Ollama server at `localhost:11434` running `qwen2.5:3b` (set by `LLM_MODEL`). Without the model download, `/api/chat` returns a 500. Without Ollama, the backend returns an error text as the answer; the frontend shows it as a service error.

The Vite proxy forwards `/api`, so the backend needs no CORS setup. CORS only matters if `VITE_API_BASE_URL` points straight at the backend.

| Symptom                                    | Likely cause                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| "Demo data" badge still shows              | `.env` still has `VITE_USE_MOCK=true`, or `npm run dev` was not restarted         |
| "Could not reach the server"               | The backend is not running, or `BACKEND_URL` is wrong                             |
| 404 on `/api/majors`                       | The backend routes are missing the `/api` prefix                                  |
| Generic error banner on a bad request      | The backend returns FastAPI's default 422 body instead of the one in the contract |
| Plan or chat fields missing or crashing    | The response differs from the contract. Compare it with `docs/openapi.yaml`       |
| Every chat question shows the system error | The embedding model could not be downloaded, or the backend raised an exception   |
| `No module named 'psycopg'` on seeding     | SQLAlchemy 2.1 uses psycopg 3 for `postgresql://`. Install `psycopg[binary]`      |

## Backend contract

`docs/API_CONTRACT.md` holds the rules and examples. `docs/openapi.yaml` is the machine-readable version. Give both to whoever owns the backend. `src/api/client.js` has one function per endpoint the UI calls and is the only code that calls `fetch`. Runtime settings live in `src/config.js`.

For a rejected request (4xx), the system error banner shows the backend's `message`, for example the unknown unit codes. For a 5xx or a lost connection it shows the generic "service not responding" text.

## Figma to code

| Figma                                        | Code                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Foundations: colour variables                | `src/styles/tokens.css`, names from the "Tokens in code" table (for example `--color-bg-brand`)   |
| Type: Newsreader, Inter, IBM Plex Mono       | `@fontsource/*` imports in `src/main.jsx`; `.t-display`, `.t-h2`, `.t-h3` in `src/styles/app.css` |
| Button, IconButton                           | `components/Button.jsx` (`variant="primary\|secondary\|ghost"`, `size="s\|m"`)                    |
| Badge, UnitCode, Cite                        | `components/Badge.jsx`                                                                            |
| Callout (Tone)                               | `components/Banner.jsx` (`tone="info\|success\|caution\|danger\|neutral"`)                        |
| SearchField                                  | `components/SearchUnits.jsx` (Ctrl K)                                                             |
| Composer and scope chips                     | `components/Composer.jsx`, chips in `pages/ChatPage.jsx`                                          |
| SourceCard                                   | `components/SourcesPanel.jsx`                                                                     |
| App/Sidebar (Role = Student)                 | `components/Shell.jsx`                                                                            |
| Home, Mobile / Home                          | `pages/HomePage.jsx`                                                                              |
| Plan semester, Mobile / Plan semester        | `pages/PlanPage.jsx`, `components/EditUnitsDialog.jsx`, logic in `lib/plan.js` and `lib/terms.js` |
| Ask the assistant, Rich answer, Mobile / Ask | `pages/ChatPage.jsx`, `components/AssistantMessage.jsx`, `MarkdownContent.jsx`, `PrereqMap.jsx`   |
| System states                                | `components/States.jsx` and the chat states in `AssistantMessage.jsx`                             |

## Accessibility and layout

- Every control has a visible 2 px focus outline (Figma: Button / Focus), and there is a skip link.
- Breakpoints follow Figma Foundations: from 1280 px three columns; 1024 to 1279 px the Sources panel moves into a drawer; 768 to 1023 px the sidebar shows icons only; below 768 px the sidebar becomes a top bar with a menu, answer tables become card lists and Save plan moves to a bottom bar.
- Dialogs and drawers keep focus inside and close with Escape. The chat thread is a live region. Animations stop with `prefers-reduced-motion`.

## Privacy

The app never asks for a name, email or student ID. The plan (units, optional grades, term and load) is written to this browser's localStorage only when the student presses Save plan. Share with advisor sends the same plan, swaps included and without any identity, to get a short code. The chat lives in memory and is gone when the tab closes. It sends the plan only while "My plan" is on. Grades go with the plan, so "Past grades" only works while "My plan" is on too.

## Tests

`npm test` runs the suite with Vitest, jsdom and Testing Library. It needs no backend and no `.env`.

- `src/lib/plan.test.js` checks terms, prerequisite rules (AND, OR, ASSUMED), swaps, WAM, the roadmap and the prerequisite path against the sample student.
- `src/api/*.test.js` check request shapes, error mapping, citation normalising, the timeout, and the mock planner for every major and load.
- `src/state/AppState.test.jsx` covers planning, saving to the browser and dropping stale swaps.
- `src/App.test.jsx` covers routing, Home to Ask, and the unit search.
- `src/pages/*.test.jsx` click through Plan semester and Ask, including the error, abstention and clarifying-question states.

## Known limits

- Mock data is sample data. Answers in the mock are fixed text.
- The backend does not read the chat's `plan` yet, and has no `POST /api/plans`. See `docs/BACKEND_HANDOFF.md`.
- Answers are not streamed.
- `doc/Dataset/Course_Prerequisites.csv` has no prerequisites for COS30008 or SWE20004, so the planner can put them in the same term as a COS20007 retake. That needs fixing in the dataset.
