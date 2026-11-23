import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { USE_MOCK } from '../config.js';
import { APP_TITLE, ROUTES } from '../routes.js';
import { useAppState } from '../state/AppState.jsx';
import { version } from '../../package.json';

function getInitialTheme() {
  const attr = document.documentElement.dataset.theme;
  if (attr === 'dark' || attr === 'light') return attr;
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage errors
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Hash links drive the router, so the skip link moves focus instead of changing the hash.
const skipToMain = () => document.getElementById('main')?.focus();

// Figma: TopBar and Sidebar
export default function Shell({ page, children }) {
  const appState = useAppState();
  const mode = appState?.mode ?? 'first-year';
  const setMode = appState?.setMode;
  const activeStudentId = appState?.activeStudentId;
  const passedCount = appState?.passedUnits?.size ?? 0;
  const enrolledCount = appState?.enrolledUnits?.size ?? 0;
  const failedCount = appState?.failedUnits?.size ?? 0;
  const completedCount = appState?.completed?.size ?? 0;
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // ignore storage errors
    }
  };

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
              Current Student
              {activeStudentId ? (
                <>
                  {' '}
                  · <span className="t-mono">ID #{activeStudentId}</span>
                </>
              ) : (
                ''
              )}
            </span>
          ) : (
            <span className="privacy-pill t-caption">
              <Icon name="lock" size={14} />
              Session only · no name or student ID stored
            </span>
          )}
          <button
            type="button"
            className="theme-toggle"
            aria-label="Toggle dark mode"
            aria-pressed={theme === 'dark'}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
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
          <div className="sidebar__summary">
            <span className="t-caption c-secondary sidebar__label">Progress</span>
            {mode === 'current-student' ? (
              <div className="sidebar__stats t-caption">
                <span className="c-success t-mono">{passedCount}P</span>
                <span className="c-enrolled t-mono">{enrolledCount}E</span>
                <span className="c-warning t-mono">{failedCount}R</span>
              </div>
            ) : (
              <span className="t-caption c-secondary">
                <span className="t-mono c-brand">{completedCount}</span> units completed
              </span>
            )}
          </div>
          <span className="t-caption c-secondary t-mono">v{version}</span>
        </div>
      </nav>
      <main className="main" id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
