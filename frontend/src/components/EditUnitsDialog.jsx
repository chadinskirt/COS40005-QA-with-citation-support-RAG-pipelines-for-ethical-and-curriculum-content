import { useMemo, useState } from 'react';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import Icon from './Icon.jsx';
import { UnitCode, categoryLabel } from './Badge.jsx';
import { CS_MAJORS, getUnitCategory } from '../data/csMajors.js';
import { GRADES } from '../lib/plan.js';
import { useAppState } from '../state/AppState.jsx';

const STATUSES = [
  ['', 'Not taken'],
  ['passed', 'Passed'],
  ['failed', 'Retake'],
  ['enrolled', 'Enrolled'],
];
const GROUPS = ['core', 'major', 'elective'];

// The student's record: major, units passed (with an optional grade), failed and in progress.
export default function EditUnitsDialog({ onClose }) {
  const { profile, setProfile, catalog, major } = useAppState();
  const [draft, setDraft] = useState(() => profile ?? { major, units: {} });
  const [query, setQuery] = useState('');

  const set = (code, patch) =>
    setDraft((d) => {
      const units = { ...d.units };
      const next = { ...units[code], ...patch };
      if (!next.status) delete units[code];
      else units[code] = next.status === 'passed' ? next : { status: next.status };
      return { ...d, units };
    });

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const shown = catalog.filter((u) => !q || u.code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
    return GROUPS.map((g) => [g, shown.filter((u) => getUnitCategory(u.code, draft.major) === g)]).filter(
      ([, l]) => l.length
    );
  }, [catalog, q, draft.major]);

  const count = (s) => Object.values(draft.units).filter((u) => u.status === s).length;

  return (
    <Dialog
      wide
      title="Edit my units"
      description="Mark what you've passed, need to retake or are taking now. Grades are optional and only used for your WAM."
      onClose={onClose}
      footer={
        <>
          <p className="t-caption c-secondary" aria-live="polite">
            {count('passed')} passed · {count('failed')} to retake · {count('enrolled')} enrolled
          </p>
          <div className="row gap-8">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setProfile(draft);
                onClose();
              }}
            >
              Save units
            </Button>
          </div>
        </>
      }
    >
      <div className="edit-units__tools">
        <label className="select">
          <span className="select__label">Major</span>
          <select
            data-autofocus
            value={draft.major}
            onChange={(e) => setDraft((d) => ({ ...d, major: e.target.value }))}
          >
            {CS_MAJORS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={14} />
        </label>
        <label className="search__field edit-units__search">
          <Icon name="search" size={15} className="c-muted" />
          <span className="sr-only">Filter units</span>
          <input
            type="search"
            placeholder="Filter by code or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {catalog.length === 0 && <p className="t-small c-secondary">Loading units…</p>}
      {catalog.length > 0 && groups.length === 0 && (
        <p className="t-small c-secondary">No units match &quot;{query.trim()}&quot;.</p>
      )}
      {groups.map(([g, list]) => (
        <section key={g} className="edit-units__group" aria-label={`${categoryLabel(g)} units`}>
          <h3 className="t-overline">{categoryLabel(g)} units</h3>
          <ul className="edit-units__list">
            {list.map((u) => {
              const rec = draft.units[u.code] ?? {};
              return (
                <li key={u.code} className="edit-units__row">
                  <div className="edit-units__unit">
                    <UnitCode code={u.code} />
                    <span className="t-label">{u.name}</span>
                  </div>
                  <div className="edit-units__controls">
                    <div className="segment" role="radiogroup" aria-label={`Status of ${u.code}`}>
                      {STATUSES.map(([value, label]) => (
                        <label key={value} className="segment__option">
                          <input
                            type="radio"
                            name={`status-${u.code}`}
                            value={value}
                            checked={(rec.status ?? '') === value}
                            onChange={() => set(u.code, { status: value })}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    {rec.status === 'passed' && (
                      <label className="select select--compact">
                        <span className="sr-only">Grade for {u.code}</span>
                        <select
                          value={rec.grade ?? ''}
                          onChange={(e) => set(u.code, { grade: e.target.value || undefined })}
                        >
                          <option value="">Grade</option>
                          {Object.keys(GRADES).map((gr) => (
                            <option key={gr} value={gr}>
                              {gr}
                            </option>
                          ))}
                        </select>
                        <Icon name="chevronDown" size={14} />
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Dialog>
  );
}
