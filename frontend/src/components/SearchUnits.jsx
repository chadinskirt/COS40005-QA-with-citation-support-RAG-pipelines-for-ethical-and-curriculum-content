import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { UnitCode } from './Badge.jsx';
import { useAppState } from '../state/AppState.jsx';

// Figma: SearchField. Ctrl K focuses it; picking a unit starts a question about it.
export default function SearchUnits({ onPick }) {
  const { catalog, setDraft } = useAppState();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      q ? catalog.filter((u) => u.code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)).slice(0, 8) : [],
    [catalog, q]
  );

  function pick(u) {
    setDraft(`Tell me about ${u.code} ${u.name}`);
    setQuery('');
    window.location.hash = '#ask';
    onPick?.();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') setQuery('');
    if (!results.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active] ?? results[0]);
    }
  }

  return (
    <div className="search">
      <label className="search__field">
        <Icon name="search" size={15} className="c-muted" />
        <span className="sr-only">Search units</span>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={Boolean(q)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
          placeholder="Search units"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd className="search__kbd" aria-hidden="true">
          Ctrl K
        </kbd>
      </label>
      {q && (
        <div className="search__pop" id={listId} role="listbox" aria-label="Units">
          {results.map((u, i) => (
            <div
              key={u.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="search__option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(u)}
            >
              <UnitCode code={u.code} />
              <span className="search__name">{u.name}</span>
            </div>
          ))}
          {results.length === 0 && (
            <div className="search__empty" role="option" aria-selected="false" aria-disabled="true">
              <p className="t-label">No units match &quot;{query.trim()}&quot;</p>
              <p className="t-caption c-secondary">
                Check the code, or search by name, for example &quot;machine learning&quot;.
              </p>
              <button type="button" className="btn btn--secondary btn--s" onClick={() => setQuery('')}>
                Clear search
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
