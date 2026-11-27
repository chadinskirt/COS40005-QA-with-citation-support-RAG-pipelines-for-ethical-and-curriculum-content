import { useEffect, useState } from 'react';
import Badge, { UnitCode, categoryLabel } from '../components/Badge.jsx';
import Banner from '../components/Banner.jsx';
import Button, { IconButton } from '../components/Button.jsx';
import Dialog from '../components/Dialog.jsx';
import EditUnitsDialog from '../components/EditUnitsDialog.jsx';
import Icon from '../components/Icon.jsx';
import { TopBar } from '../components/Shell.jsx';
import { CurriculumError, ServiceError, StateCard } from '../components/States.jsx';
import { api } from '../api/client.js';
import { USE_MOCK } from '../config.js';
import { describeMissing, prerequisitePath, STANDARD_LOAD } from '../lib/plan.js';
import { addTerms, termKey, termLabel, upcomingTerms } from '../lib/terms.js';
import { useAppState } from '../state/AppState.jsx';

const LOADS = [
  [2, '2 units'],
  [3, 'Standard · 3 units'],
  [4, '4 units'],
];
const cp = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)} cp`;

// Figma: Plan semester (desktop and mobile)
export default function PlanPage() {
  const { profile, setProfile, plan, retryPlan, view, start, setStart, load, setLoad, saved, savePlan, major } =
    useAppState();
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const save = () => setSaveFailed(!savePlan());
  const terms = upcomingTerms(4);
  if (!terms.some((t) => termKey(t) === termKey(start))) terms.unshift(start);

  const status = saveFailed
    ? "Couldn't save on this device"
    : saved
      ? 'Saved on this device'
      : profile
        ? 'Not saved yet'
        : null;
  const controls = (
    <>
      <label className="select">
        <span className="select__label">Planning</span>
        <select value={termKey(start)} onChange={(e) => setStart(terms.find((t) => termKey(t) === e.target.value))}>
          {terms.map((t) => (
            <option key={termKey(t)} value={termKey(t)}>
              {termLabel(t)}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={14} />
      </label>
      <label className="select">
        <span className="select__label">Load</span>
        <select value={load} onChange={(e) => setLoad(Number(e.target.value))}>
          {LOADS.map(([n, label]) => (
            <option key={n} value={n}>
              {label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={14} />
      </label>
    </>
  );

  return (
    <>
      <TopBar
        actions={
          <>
            <div className="topbar__controls">{controls}</div>
            {status && (
              <span className={`t-caption ${saveFailed ? 'c-danger' : 'c-muted'} hide-mobile`} aria-live="polite">
                {status}
              </span>
            )}
            <Button size="m" onClick={save} disabled={!profile} className="hide-mobile">
              Save plan
            </Button>
          </>
        }
      >
        Plan semester
      </TopBar>

      <div className="content content--plan">
        <div className="plan-controls-mobile">{controls}</div>
        {!profile && <EmptyPlan onStart={() => setProfile({ major, units: {} })} onEdit={() => setEditing(true)} />}
        {profile && plan.status === 'error' && (
          <>
            <PlanHeader onEdit={() => setEditing(true)} />
            {plan.error.code === 'CURRICULUM_CYCLE' ? (
              <CurriculumError error={plan.error} />
            ) : (
              <ServiceError error={plan.error} onRetry={retryPlan} what="Your plan" />
            )}
          </>
        )}
        {profile && !view && plan.status !== 'error' && <PlanSkeleton />}
        {view && (
          <PlanBody
            view={view}
            updating={plan.status === 'loading'}
            onEdit={() => setEditing(true)}
            onShare={() => setSharing(true)}
          />
        )}
      </div>

      {profile && (
        <div className="bottom-bar show-mobile">
          <div>
            <p className="t-label">{view ? cp(view.currentCp) : '—'}</p>
            <p className="t-caption c-muted">{status}</p>
          </div>
          <Button size="m" onClick={save}>
            Save plan
          </Button>
        </div>
      )}

      {editing && <EditUnitsDialog onClose={() => setEditing(false)} />}
      {sharing && <ShareDialog onClose={() => setSharing(false)} />}
    </>
  );
}

function PlanHeader({ onEdit, view }) {
  const { start } = useAppState();
  const s = view?.stats;
  const units = s && [
    `${s.passedCount} unit${s.passedCount === 1 ? '' : 's'} passed`,
    s.retakeCount && `${s.retakeCount} to retake`,
    s.enrolledCount && `${s.enrolledCount} enrolled`,
  ];
  const parts = s ? [view.major?.name, `Year ${s.year}`, units.filter(Boolean).join(', ')] : [];
  return (
    <div className="plan-header">
      <div>
        <h1 className="t-display-s">{termLabel(start)}</h1>
        {s && <p className="t-body c-secondary">{parts.filter(Boolean).join(' · ')}</p>}
      </div>
      <Button variant="secondary" onClick={onEdit}>
        Edit my units
      </Button>
    </div>
  );
}

function PlanBody({ view, updating, onEdit, onShare }) {
  const { load, profile, start } = useAppState();
  const [selected, setSelected] = useState(null);
  const s = view.stats;
  const focus = view.current.find((u) => u.code === selected) ?? view.current.find((u) => u.unlocks) ?? view.current[0];

  return (
    <div className="plan stack gap-24" aria-busy={updating}>
      <PlanHeader onEdit={onEdit} view={view} />
      {updating && (
        <p className="sr-only" role="status">
          Updating your plan
        </p>
      )}

      <div className="stats">
        <Stat label="Credit points" value={`${s.passedCp} / 300`}>
          <span className="progress" aria-hidden="true">
            <span style={{ width: `${Math.round(s.progress * 100)}%` }} />
          </span>
          <span className="hide-mobile">{Math.round(s.progress * 100)}% complete</span>
        </Stat>
        <Stat label="WAM" value={s.wam ? s.wam.value.toFixed(1) : '—'}>
          <span className="hide-mobile">
            {s.wam
              ? `${s.wam.band} average · ${s.wam.count} grade${s.wam.count > 1 ? 's' : ''}`
              : 'Add grades to see it'}
          </span>
        </Stat>
        <Stat label="Units remaining" value={s.unitsRemaining}>
          <span className="hide-mobile">
            {s.semestersLeft} semester{s.semestersLeft === 1 ? '' : 's'} at {load} unit{load === 1 ? '' : 's'}
          </span>
        </Stat>
        <Stat label="Earliest graduation" value={s.graduation ?? '—'} small>
          <span className="hide-mobile">
            {view.violations.length
              ? 'Fix the plan first'
              : view.notYetEligible.some((u) => !u.from)
                ? 'Some units are not planned yet'
                : 'On track with this plan'}
          </span>
        </Stat>
      </div>

      {view.violations.length === 0 ? (
        view.current.length > 0 && (
          <Banner
            tone="success"
            title={`All ${view.current.length} unit${view.current.length > 1 ? 's' : ''} meet their prerequisites.`}
          />
        )
      ) : (
        <Banner tone="danger" title="This plan breaks a prerequisite rule">
          {view.violations.map((v) => `${v.code} needs ${describeMissing(v.missing)} first.`).join(' ')}
        </Banner>
      )}
      {load !== STANDARD_LOAD && (
        <Banner tone="caution" title={`Taking ${load} units needs approval from the Academic Office.`} />
      )}

      {view.current.length === 0 && view.currentElectives === 0 ? (
        <Banner tone="success" title="Every unit in your major is passed or in progress.">
          Check with an advisor that you meet the graduation requirements.
        </Banner>
      ) : (
        <div className="plan-grid">
          <RecommendedUnits view={view} onShare={onShare} selected={selected} onSelect={setSelected} />
          <div className="plan-side">
            {focus && <PrerequisitePath code={focus.code} view={view} profile={profile} />}
            <NotYetEligible units={view.notYetEligible} start={start} />
          </div>
        </div>
      )}

      <RoadToGraduation view={view} />
    </div>
  );
}

function Stat({ label, value, small, children }) {
  return (
    <div className="stat">
      <p className="stat__label">{label}</p>
      <p className={`stat__value${small ? ' stat__value--s' : ''}`}>{value}</p>
      <p className="stat__sub">{children}</p>
    </div>
  );
}

function RecommendedUnits({ view, onShare, selected, onSelect }) {
  const { load } = useAppState();
  return (
    <section className="card card--flush" aria-labelledby="rec-title">
      <div className="card__head">
        <div>
          <h2 id="rec-title" className="t-h3">
            Recommended units
          </h2>
          <p className="t-caption c-muted hide-mobile">
            Retakes and units on the critical path come first, so your graduation date doesn&apos;t slip.
          </p>
        </div>
        <div className="card__head-meta hide-mobile">
          <p className="t-label-l">{cp(view.currentCp)}</p>
          <p className="t-caption c-muted">{load === STANDARD_LOAD ? 'Standard load' : `${load}-unit load`}</p>
        </div>
      </div>
      <ol className="unit-rows">
        {view.current.map((u, i) => (
          <UnitRow key={u.code} unit={u} index={i + 1} view={view} selected={selected === u.code} onSelect={onSelect} />
        ))}
        {Array.from({ length: view.currentElectives }, (_, i) => (
          <li key={`elective-${i}`} className="unit-row unit-row--free">
            <span className="index" aria-hidden="true">
              {view.current.length + i + 1}
            </span>
            <div className="unit-row__body">
              <p className="unit-row__title">
                <span className="unit-row__name">Elective of your choice</span>
                <Badge>Elective</Badge>
              </p>
              <p className="unit-row__reason">A free slot. Pick any elective whose prerequisites you meet.</p>
            </div>
            <span className="unit-row__cp hide-mobile">12.5 cp</span>
          </li>
        ))}
      </ol>
      <div className="card__foot">
        <p className="t-caption c-muted row gap-6">
          <Icon name="info" size={14} />A standard load is 3 units. Taking 2 or 4 needs approval from the Academic
          Office.
        </p>
        <Button variant="secondary" onClick={onShare}>
          Share with advisor
        </Button>
      </div>
    </section>
  );
}

function UnitRow({ unit: u, index, view, selected, onSelect }) {
  const { addSwap, profile, discussUnitInChat } = useAppState();
  const [open, setOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const status = (c) =>
    ({ passed: 'passed', enrolled: 'in progress', failed: 'to retake' })[profile.units[c]?.status] ??
    (view.termOf[c] ? `planned ${termLabel(view.termOf[c])}` : 'not planned');
  const { and, or } = u.prereqs;
  const rules = [...and.map((c) => [c]), ...(or.length ? [or] : [])];

  return (
    <li className={`unit-row${selected ? ' unit-row--selected' : ''}`}>
      <span className="index" aria-hidden="true">
        {index}
      </span>
      <div className="unit-row__body">
        <p className="unit-row__title">
          <UnitCode code={u.code} />
          <button
            type="button"
            className="unit-row__name link-btn"
            onClick={() => onSelect(u.code)}
            aria-pressed={selected}
          >
            {u.name}
          </button>
          {u.retake && <Badge tone="retake" />}
          {u.critical && <Badge tone="brand">Critical path</Badge>}
          {!u.retake && <Badge>{categoryLabel(u.category)}</Badge>}
        </p>
        <p className="unit-row__reason">{u.reason}</p>
        {open && (
          <dl className="unit-row__rules" id={`rules-${u.code}`}>
            <dt>Prerequisites</dt>
            <dd>
              {rules.length
                ? rules.map((group) => group.map((c) => `${c} (${status(c)})`).join(' or ')).join(', and ')
                : 'None'}
            </dd>
            <dt>Unlocks</dt>
            <dd>
              {u.dependents.length
                ? u.dependents.map((c) => `${c} (${status(c)})`).join(', ')
                : 'No later units in your plan'}
            </dd>
          </dl>
        )}
        {swapping && (
          <div className="swap-list" role="group" aria-label={`Swap ${u.code} with`}>
            {u.swaps.length ? (
              <>
                <p className="t-caption c-muted">
                  Swap with a later unit. Only swaps that keep every prerequisite are listed.
                </p>
                {u.swaps.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    className="swap-list__item"
                    onClick={() => {
                      addSwap(u.code, o.code);
                      setSwapping(false);
                    }}
                  >
                    <UnitCode code={o.code} />
                    <span>{o.name}</span>
                    <span className="c-muted t-caption">{termLabel(view.termOf[o.code])}</span>
                  </button>
                ))}
              </>
            ) : (
              <p className="t-caption c-muted">No later unit can take this place without breaking a prerequisite.</p>
            )}
          </div>
        )}
      </div>
      <span className="unit-row__cp hide-mobile">{cp(u.cp)}</span>
      <div className="unit-row__actions hide-mobile">
        <Button variant="ghost" onClick={() => discussUnitInChat(u.code, u.name)}>
          Discuss in Chat
        </Button>
        <Button variant="ghost" onClick={() => setSwapping((v) => !v)} aria-expanded={swapping}>
          Swap
        </Button>
        <IconButton
          label={open ? `Hide rules for ${u.code}` : `Show rules for ${u.code}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={open ? `rules-${u.code}` : undefined}
        >
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} />
        </IconButton>
      </div>
    </li>
  );
}

const PATH_STATUS = {
  passed: { dot: 'pass', tone: 'c-pass' },
  enrolled: { dot: 'pass', tone: 'c-pass' },
  retake: { dot: 'retake', tone: 'c-retake' },
  now: { dot: 'now', tone: 'c-brand' },
  later: { dot: 'later', tone: 'c-muted' },
};

function PrerequisitePath({ code, view, profile }) {
  const [open, setOpen] = useState(false);
  const path = prerequisitePath(code, view, profile);
  const first = new Set(view.semesters[0] ?? []);
  const row = (c) => {
    const rec = profile.units[c];
    if (rec?.status === 'passed') return ['passed', `Passed${rec.grade ? ` · ${rec.grade}` : ''}`];
    if (rec?.status === 'enrolled') return ['enrolled', 'Enrolled now'];
    if (first.has(c)) return rec?.status === 'failed' ? ['retake', 'Retake this semester'] : ['now', 'This semester'];
    return ['later', view.termOf[c] ? termLabel(view.termOf[c]) : 'Not planned'];
  };
  return (
    <section className="card path-card" aria-labelledby="path-title" data-open={open}>
      <button
        type="button"
        className="path-card__toggle show-mobile"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="flow" size={16} />
        <span>Prerequisite path</span>
        <Icon name={open ? 'chevronUp' : 'chevronRight'} size={16} />
      </button>
      <div className="path-card__body">
        <div className="card__title-row">
          <h2 id="path-title" className="t-h3">
            Prerequisite path
          </h2>
          <span className="t-caption c-muted">to {path[path.length - 1]}</span>
        </div>
        <ol className="path">
          {path.map((c) => {
            const [key, label] = row(c);
            const st = PATH_STATUS[key];
            return (
              <li key={c} className={`path__step path__step--${st.dot}`}>
                <span className={`path__dot path__dot--${st.dot}`} aria-hidden="true">
                  {key === 'passed' || key === 'enrolled' ? <Icon name="check" size={12} strokeWidth={2.5} /> : null}
                  {key === 'retake' ? <Icon name="refresh" size={11} strokeWidth={2} /> : null}
                </span>
                <div>
                  <p className="path__meta">
                    <span className={`t-mono ${key === 'later' ? 'c-muted' : ''}`}>{c}</span>
                    <span className={st.tone}>{label}</span>
                  </p>
                  <p className={`t-small ${key === 'later' ? 'c-secondary' : ''}`}>{view.unit(c).name}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="legend">
          <span>
            <span className="dot dot--pass" aria-hidden="true" />
            Passed
          </span>
          <span>
            <span className="dot dot--retake" aria-hidden="true" />
            Retake
          </span>
          <span>
            <span className="dot dot--later" aria-hidden="true" />
            Planned
          </span>
        </p>
      </div>
    </section>
  );
}

function NotYetEligible({ units: all, start }) {
  // Units this semester unlocks for next term come first, then blocked ones, then those that open later.
  const isNext = (u) => u.from && termKey(u.from) === termKey(addTerms(start, 1));
  const units = [...all.filter(isNext), ...all.filter((u) => !u.from), ...all.filter((u) => u.from && !isNext(u))];
  if (!units.length) return null;
  return (
    <section className="card hide-mobile" aria-labelledby="nye-title">
      <h2 id="nye-title" className="t-h3">
        Not yet eligible
      </h2>
      <ul className="stack gap-8">
        {units.slice(0, 2).map((u) => (
          <li key={u.code} className="waiting">
            <UnitCode code={u.code} />
            <p className="t-label">{u.name}</p>
            <p className="waiting__why">
              <Icon name="lock" size={13} />
              <span>
                {u.missing.length
                  ? `Needs ${describeMissing(u.missing)} first.`
                  : 'Its prerequisites are not in your plan.'}{' '}
                {u.from ? `You can take it from ${termLabel(u.from)}.` : 'It is not in this plan yet.'}
              </span>
            </p>
          </li>
        ))}
      </ul>
      {all.length > 2 && (
        <p className="t-caption c-muted">
          {all.length - Math.min(2, units.length)} more wait on later units. See the road to graduation below.
        </p>
      )}
    </section>
  );
}

function exportRoadmap(view) {
  const rows = [['Term', 'Code', 'Unit', 'Note']];
  for (const t of view.roadmap) {
    for (const u of t.units) rows.push([t.label, u.code, u.name, u.retake ? 'Retake' : '']);
    for (let i = 0; i < t.electives; i++) rows.push([t.label, '', 'Elective', '']);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'roadmap.csv' });
  a.click();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RoadToGraduation({ view }) {
  const { load } = useAppState();
  const s = view.stats;
  return (
    <section className="card road hide-mobile" id="roadmap" aria-labelledby="road-title">
      <div className="card__title-row">
        <div>
          <h2 id="road-title" className="t-h3">
            Road to graduation
          </h2>
          <p className="t-caption c-muted">
            Based on prerequisites and a {load === STANDARD_LOAD ? 'standard ' : ''}load of {load} units. It updates
            when your results come in.
          </p>
        </div>
        <Button variant="ghost" onClick={() => exportRoadmap(view)}>
          Export roadmap
        </Button>
      </div>
      <ol className="road__terms" tabIndex={0} aria-label="Terms until graduation">
        {view.roadmap.map((t, i) => {
          const lastTerm = i === view.roadmap.length - 1;
          const n = t.units.length + t.electives;
          return (
            <li key={t.label} className={`term${t.current ? ' term--current' : ''}`}>
              <p className="term__name">{t.label}</p>
              <p className="term__sub">{t.current ? 'This plan' : `${n} unit${n === 1 ? '' : 's'}`}</p>
              <ul className="term__units">
                {t.units.map((u) => (
                  <li key={u.code}>
                    <span className="term__code">
                      <span className="t-mono">{u.code}</span>
                      {u.retake && <Badge tone="retake" />}
                    </span>
                    <span className="term__unit-name">{u.name}</span>
                  </li>
                ))}
                {Array.from({ length: t.electives }, (_, k) => (
                  <li key={`e${k}`} className="c-muted">
                    Elective
                  </li>
                ))}
              </ul>
              {lastTerm && (
                <>
                  <p className="term__grad">
                    <Icon name="graduate" size={14} />
                    Graduate
                  </p>
                  {s.finishEarly && (
                    <p className="t-caption c-muted">
                      With approval for one 4-unit semester, you could finish in {s.finishEarly}.
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PlanSkeleton() {
  return (
    <div className="stack gap-24" aria-busy="true">
      <p className="sr-only" role="status">
        Checking every prerequisite rule
      </p>
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--stats" />
      <div className="skeleton skeleton--banner" />
      <div className="plan-grid">
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
      </div>
    </div>
  );
}

function EmptyPlan({ onStart, onEdit }) {
  const { setProfile, major, load } = useAppState();
  const [sample, setSample] = useState(null);
  // The planner only schedules units of the major, so the card lists the first semester it will
  // actually suggest rather than a fixed set of core codes.
  const [first, setFirst] = useState(null);
  useEffect(() => {
    if (USE_MOCK) import('../api/mock.js').then((m) => setSample(m.SAMPLE_PROFILE));
  }, []);
  useEffect(() => {
    let live = true;
    api.recommend({ major, units: {} }, load).then(
      (d) => live && setFirst(d.semesters?.[0]?.units.map((u) => u.code) ?? []),
      () => live && setFirst([])
    );
    return () => {
      live = false;
    };
  }, [major, load]);
  return (
    <div className="empty-plan">
      <StateCard
        label="Empty plan"
        tone="brand"
        icon="graduate"
        title="No passed units yet"
        actions={
          <>
            <Button size="m" onClick={onStart}>
              Use this semester
            </Button>
            <Button variant="secondary" size="m" onClick={onEdit}>
              Add my units
            </Button>
            <Button variant="ghost" size="m" as="a" href="#majors">
              Explore majors
            </Button>
          </>
        }
      >
        <p>We suggest a first semester of units you can take now, picked for your major.</p>
        {first?.length > 0 && (
          <ul className="code-list">
            {first.map((c) => (
              <li key={c}>
                <UnitCode code={c} />
              </li>
            ))}
          </ul>
        )}
      </StateCard>
      {sample && (
        <button type="button" className="link-btn t-caption" onClick={() => setProfile(sample)}>
          Demo data: load a sample student
        </button>
      )}
    </div>
  );
}

function ShareDialog({ onClose }) {
  const { profile, start, load, swaps, savePlan } = useAppState();
  const [state, setState] = useState({ status: 'loading' });
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    savePlan();
    setState({ status: 'loading' });
    // Swaps go too, so the advisor sees the same semesters as the student.
    api.sharePlan({ ...profile, start: termKey(start), load, swaps }).then(
      (d) => live && setState({ status: 'done', code: d.code }),
      (error) => live && setState({ status: 'error', error })
    );
    return () => {
      live = false;
    };
    // Share the plan as it is when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <Dialog title="Share with advisor" onClose={onClose}>
      {state.status === 'loading' && <p className="t-small c-secondary">Saving your plan…</p>}
      {state.status === 'error' && (
        <ServiceError
          error={
            state.error.status === 404 || state.error.status === 405
              ? { ...state.error, message: 'Plan sharing is not available on this server yet.' }
              : state.error
          }
          onRetry={() => setAttempt((n) => n + 1)}
          what="Your plan"
        />
      )}
      {state.status === 'done' && (
        <StateCard label="Plan shared" tone="success" icon="checkCircle" title="Plan saved and ready to share">
          <p>Give this code to your advisor. It holds your units and grades, with no name or student ID.</p>
          <p className="share-code">
            <span className="share-code__value">{state.code}</span>
            <IconButton
              label={copied ? 'Copied' : 'Copy plan code'}
              onClick={() => navigator.clipboard?.writeText(state.code).then(() => setCopied(true))}
            >
              <Icon name={copied ? 'check' : 'copy'} size={16} />
            </IconButton>
          </p>
        </StateCard>
      )}
    </Dialog>
  );
}
