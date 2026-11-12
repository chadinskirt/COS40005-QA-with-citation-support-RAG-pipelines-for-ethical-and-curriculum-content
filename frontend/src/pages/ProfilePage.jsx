import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useRequest } from '../state/useRequest.js';
import { useAppState } from '../state/AppState.jsx';
import { MajorChip } from '../components/Chips.jsx';
import UnitSelect from '../components/UnitSelect.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import Banner from '../components/Banner.jsx';
import PathwayResults from '../components/PathwayResults.jsx';
import { SystemError } from '../components/States.jsx';

// Figma S1, with the recommended pathway (former S2) under the form
export default function ProfilePage() {
  const { major, selectMajor, completed, toggleUnit, clearUnits, plan, setPlan } = useAppState();
  const [query, setQuery] = useState('');
  const resultsRef = useRef(null);

  const majors = useRequest(api.getMajors);
  const loadUnits = useCallback(() => api.getUnits(major), [major]);
  const units = useRequest(major ? loadUnits : null);

  // Pick the first major when none is chosen yet or the chosen one is not offered.
  useEffect(() => {
    const list = majors.data?.majors;
    if (list?.length && !list.some((m) => m.id === major)) selectMajor(list[0].id);
  }, [majors.data, major, selectMajor]);

  const profileKey = `${major}|${[...completed].sort().join(',')}`;

  async function generate() {
    setPlan({ status: 'loading', key: profileKey });
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: 'start' }));
    try {
      const data = await api.recommend(major, [...completed]);
      setPlan({ status: 'done', data, key: profileKey });
    } catch (error) {
      setPlan({ status: 'error', error, key: profileKey });
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = units.data?.units ?? [];
    return q ? list.filter((u) => u.code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)) : list;
  }, [units.data, query]);

  const generateLabel = { idle: 'Generate pathway', loading: 'Generating…' }[plan.status] ?? 'Update pathway';

  return (
    <div className="stack gap-12">
      <div className="two-col">
        <div className="stack gap-8">
          <div className="page-header">
            <h1 className="t-display">Your study profile</h1>
            <p className="t-body c-secondary">
              Choose your target major and tick the units you have completed. Nothing here is stored after you close
              this tab.
            </p>
          </div>

          <section className="stack gap-3" aria-labelledby="step-major">
            <h2 id="step-major" className="t-label">
              1. Target major
            </h2>
            {majors.error ? (
              <SystemError error={majors.error} onRetry={majors.retry} />
            ) : (
              <div className="row wrap gap-2" aria-busy={majors.loading}>
                {majors.loading && <p className="t-small c-secondary">Loading majors…</p>}
                {(majors.data?.majors ?? []).map((m) => (
                  <MajorChip key={m.id} selected={m.id === major} onClick={() => selectMajor(m.id)}>
                    {m.name}
                  </MajorChip>
                ))}
              </div>
            )}
          </section>

          <section className="stack gap-3" aria-labelledby="step-units">
            <div className="row gap-3">
              <h2 id="step-units" className="t-label">
                2. Completed units
              </h2>
              <span className="t-caption c-brand" aria-live="polite">
                {completed.size} selected
              </span>
            </div>
            <label className="field field--search">
              <Icon name="search" size={18} className="c-secondary" />
              <span className="sr-only">Search unit code or name</span>
              <input
                type="search"
                placeholder="Search unit code or name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {units.error ? (
              <SystemError error={units.error} onRetry={units.retry} />
            ) : (
              <div className="unit-grid" aria-busy={units.loading}>
                {units.loading && <p className="t-small c-secondary">Loading units…</p>}
                {shown.map((u) => (
                  <UnitSelect key={u.code} unit={u} checked={completed.has(u.code)} onToggle={toggleUnit} />
                ))}
                {units.data && shown.length === 0 && (
                  <p className="t-small c-secondary">{`No unit matches "${query}".`}</p>
                )}
              </div>
            )}
          </section>

          <div className="row wrap gap-3">
            <Button onClick={generate} disabled={!major || plan.status === 'loading'}>
              {generateLabel}
            </Button>
            <Button variant="ghost" onClick={clearUnits}>
              Clear selection
            </Button>
          </div>
        </div>

        <aside className="stack gap-6">
          <div className="card">
            <div className="row gap-2">
              <span className="c-success">
                <Icon name="lock" />
              </span>
              <h2 className="t-h2">Your privacy</h2>
            </div>
            <p className="t-small c-secondary">
              We never ask for your name, email or student ID. Your profile is processed in memory and discarded when
              the session ends.
            </p>
            <p className="t-caption c-success">Aligned with Australian Privacy Principles 3 &amp; 6.</p>
          </div>
          <div className="card">
            <h2 className="t-h2">How it works</h2>
            <ol className="t-small stack gap-3 steps">
              <li>Pick a major and completed units</li>
              <li>We check every prerequisite rule</li>
              <li>You get a semester plan with reasons</li>
              <li>Ask the syllabus for policy details</li>
            </ol>
          </div>
        </aside>
      </div>

      {plan.status !== 'idle' && (
        <section ref={resultsRef} className="stack gap-6 results" aria-labelledby="results-title">
          <div className="page-header page-header--actions">
            <div>
              <h2 id="results-title" className="t-h1">
                Recommended pathway
              </h2>
              <p className="t-body c-secondary">
                {plan.data
                  ? `${plan.data.major.name} major · based on ${plan.data.completed_units.length} completed units`
                  : 'Based on your study profile'}
              </p>
            </div>
            <Button as="a" href="#ask">
              Ask about this plan
            </Button>
          </div>
          {plan.status === 'done' && plan.key !== profileKey && (
            <Banner tone="info" title="Your profile changed">
              Press Update pathway to recalculate the plan.
            </Banner>
          )}
          <PathwayResults state={plan} onRetry={generate} />
        </section>
      )}
    </div>
  );
}
