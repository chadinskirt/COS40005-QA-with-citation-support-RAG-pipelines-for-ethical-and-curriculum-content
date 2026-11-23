import Icon from './Icon.jsx';
import { USE_MOCK } from '../config.js';
import { APP_TITLE, ROUTES } from '../routes.js';
import { useAppState } from '../state/AppState.jsx';
import { version } from '../../package.json';

// Hash links drive the router, so the skip link moves focus instead of changing the hash.
const skipToMain = () => document.getElementById('main')?.focus();

// Figma: TopBar and Sidebar
export default function Shell({ page, children }) {
  const appState = useAppState();
  const mode = appState?.mode ?? 'first-year';
  const setMode = appState?.setMode;
  const activeStudentId = appState?.activeStudentId;

  return (
    <div className="shell">
      <button type="button" className="skip-link t-label" onClick={skipToMain}>
        Skip to content
      </button>
      <header className="topbar">
        <a className="brand" href="#profile">
          <span className="brand__logo t-label" aria-hidden="true">
            A
          </span>
          <span className="t-h2">{APP_TITLE}</span>
        </a>
        <div className="row gap-3">
          {USE_MOCK && <span className="mock-pill t-caption">Demo data</span>}
          {mode === 'current-student' ? (
            <span className="mode-pill t-caption">
              Current Student{activeStudentId ? ` · ID #${activeStudentId}` : ''}
            </span>
          ) : (
            <span className="privacy-pill t-caption">
              <Icon name="lock" size={14} />
              Session only · no name or student ID stored
            </span>
          )}
        </div>
      </header>
      <nav className="sidebar" aria-label="Main">
        <div className="stack gap-6">
          <div className="stack gap-2">
            <span className="t-caption c-secondary sidebar__label">Advising mode</span>
            <div className="mode-switch" role="group" aria-label="Student mode">
              <button
                type="button"
                className="mode-switch__btn"
                aria-pressed={mode === 'first-year'}
                onClick={() => setMode?.('first-year')}
              >
                First-Year
              </button>
              <button
                type="button"
                className="mode-switch__btn"
                aria-pressed={mode === 'current-student'}
                onClick={() => setMode?.('current-student')}
              >
                Current Student
              </button>
            </div>
          </div>
          <div className="nav">
            {ROUTES.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="nav-item" aria-current={page === n.id ? 'page' : undefined}>
                {n.label}
              </a>
            ))}
          </div>
        </div>
        <div className="sidebar__foot">
          <span className="t-caption c-secondary">v{version}</span>
        </div>
      </nav>
      <main className="main" id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
