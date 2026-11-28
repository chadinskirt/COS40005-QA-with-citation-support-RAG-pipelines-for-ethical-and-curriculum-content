import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import Badge from './Badge.jsx';
import SearchUnits from './SearchUnits.jsx';
import { OUTLINE_COUNT, OUTLINES_SYNCED, USE_MOCK } from '../config.js';
import { ROUTES } from '../routes.js';
import { useAppState } from '../state/AppState.jsx';

// Hash links drive the router, so the skip link moves focus instead of changing the hash.
const skipToMain = () => document.getElementById('main')?.focus();

<<<<<<< Updated upstream
const THEME_KEY = 'advising-portal:theme';

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

=======
>>>>>>> Stashed changes
// Figma: App/Sidebar (Role = Student). Below 768 px it becomes a top bar with a menu.
export default function Shell({ page, children }) {
  const { start } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
<<<<<<< Updated upstream
  const [theme, setTheme] = useState(readTheme);
=======
>>>>>>> Stashed changes
  const label = ROUTES.find((r) => r.id === page)?.label;

  useEffect(() => setMenuOpen(false), [page]);
  useEffect(() => {
<<<<<<< Updated upstream
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  useEffect(() => setMenuOpen(false), [page]);
  useEffect(() => {
=======
>>>>>>> Stashed changes
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="app">
      <button type="button" className="skip-link" onClick={skipToMain}>
        Skip to content
      </button>

      <header className="mobile-bar">
        <span className="avatar" aria-hidden="true">
          AP
        </span>
        <span className="mobile-bar__title">{page === 'home' ? 'Advising Portal' : label}</span>
        <button
          type="button"
<<<<<<< Updated upstream
          className="theme-toggle"
          aria-label="Toggle dark mode"
          aria-pressed={theme === 'dark'}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
        <button
          type="button"
=======
>>>>>>> Stashed changes
          className="icon-btn"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Icon name={menuOpen ? 'x' : 'menu'} size={20} />
        </button>
      </header>

      <nav className="sidebar" id="sidebar" aria-label="Main" data-open={menuOpen}>
        <a className="brand" href="#home">
          <span className="avatar" aria-hidden="true">
            AP
          </span>
          <span className="brand__text">
            <span className="brand__name">Advising Portal</span>
            <span className="brand__sub">Computer Science · {start.year}</span>
          </span>
        </a>
        <SearchUnits onPick={() => setMenuOpen(false)} />
        <ul className="nav">
          {ROUTES.map((r) => (
            <li key={r.id}>
              <a
                href={`#${r.id}`}
                className="nav__item"
                aria-current={page === r.id ? 'page' : undefined}
                title={r.label}
              >
                <Icon name={r.icon} size={16} />
                <span className="nav__label">{r.label}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="sidebar__foot">
          <div className="storage-note">
            <p className="storage-note__title">
              <Icon name="lock" size={14} />
              Saved on this device only
            </p>
            <p className="storage-note__body">
              Your plan stays on this device. Share it with an advisor using a plan code.
            </p>
          </div>
          <p className="sync">
            <span className="dot dot--pass" aria-hidden="true" />
            {OUTLINE_COUNT} unit outlines · synced {OUTLINES_SYNCED}
            {USE_MOCK && <Badge tone="caution">Demo data</Badge>}
<<<<<<< Updated upstream
            <button
              type="button"
              className="theme-toggle"
              aria-label="Toggle dark mode"
              aria-pressed={theme === 'dark'}
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
            </button>
=======
>>>>>>> Stashed changes
          </p>
        </div>
      </nav>
      {menuOpen && <div className="scrim" aria-hidden="true" onClick={() => setMenuOpen(false)} />}

      <main className="main" id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

// Figma: Topbar. Title on the left, page actions on the right.
export function TopBar({ children, actions }) {
  return (
    <div className="topbar">
      <div className="topbar__title">{children}</div>
      {actions && <div className="topbar__actions">{actions}</div>}
    </div>
  );
}
