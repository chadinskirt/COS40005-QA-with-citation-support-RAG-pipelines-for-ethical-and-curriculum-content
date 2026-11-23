import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { getUnitCategory, mergeMajors, mergeUnitsForMajor } from '../data/csMajors.js';
import { useRequest } from '../state/useRequest.js';
import { useAppState } from '../state/AppState.jsx';
import { MajorChip } from './Chips.jsx';
import Button from './Button.jsx';
import Icon from './Icon.jsx';
import Banner from './Banner.jsx';
import UnitCard from './UnitCard.jsx';
import DagGraph from './DagGraph.jsx';
import { CurriculumError, PathwaySkeleton, SystemError } from './States.jsx';

const UNIT_STATUS_OPTIONS = [
  { key: 'passed', label: 'Passed' },
  { key: 'enrolled', label: 'Currently Enrolled' },
  { key: 'failed', label: 'Failed / Retake' },
];

export default function CurrentStudentProfile() {
  const {
    studentId,
    setStudentId,
    activeStudentId,
    setActiveStudentId,
    studentLookup,
    setStudentLookup,
    studentSave,
    setStudentSave,
    studentMajor,
    selectStudentMajor,
    targetCareer,
    setTargetCareer,
    studyGoal,
    setStudyGoal,
    unitsPerSemester,
    setUnitsPerSemester,
    passedUnits,
    failedUnits,
    enrolledUnits,
    assignUnitStatus,
    clearStudentUnits,
    studentPlan,
    setStudentPlan,
    hydrateStudentProfile,
  } = useAppState();

  const [query, setQuery] = useState('');
  const [idError, setIdError] = useState('');
  const resultsRef = useRef(null);

  const majors = useRequest(api.getMajors);
  const loadUnits = useCallback(() => api.getUnits(studentMajor), [studentMajor]);
  const units = useRequest(studentMajor ? loadUnits : null);

  const majorList = useMemo(
    () => (majors.data ? mergeMajors(majors.data.majors ?? []) : []),
    [majors.data]
  );

  useEffect(() => {
    if (majorList.length && !majorList.some((m) => m.id === studentMajor)) {
      selectStudentMajor(majorList[0].id);
    }
  }, [majorList, studentMajor, selectStudentMajor]);

  const parsedId = /^\d+$/.test(studentId.trim()) ? Number(studentId.trim()) : null;

  function validateId() {
    if (!parsedId || parsedId <= 0) {
      setIdError('Enter a numeric Student ID (e.g. 100001).');
      return null;
    }
    setIdError('');
    return parsedId;
  }

  async function lookupStudent() {
    const id = validateId();
    if (!id) return;
    setStudentLookup({ status: 'loading' });
    setStudentSave({ status: 'idle' });
    try {
      const data = await api.getStudent(id);
      hydrateStudentProfile(data);
      setStudentLookup({ status: 'loaded', id });
    } catch (error) {
      if (error?.status === 404) {
        setActiveStudentId(id);
        setStudentLookup({ status: 'new', id });
      } else {
        setStudentLookup({ status: 'error', error });
      }
    }
  }

  async function saveProfile() {
    const id = validateId();
    if (!id || !studentMajor) return null;
    setStudentSave({ status: 'saving' });
    const payload = {
      major_code: studentMajor,
      passed_units: [...passedUnits],
      failed_units: [...failedUnits],
      enrolled_units: [...enrolledUnits],
      ...(targetCareer.trim() ? { target_career: targetCareer.trim() } : {}),
      ...(studyGoal.trim() ? { study_goal: studyGoal.trim() } : {}),
    };
    try {
      const saved = await api.saveStudent(id, payload);
      hydrateStudentProfile(saved);
      setStudentLookup({ status: 'loaded', id });
      setStudentSave({ status: 'saved', id });
      return saved;
    } catch (error) {
      setStudentSave({ status: 'error', error });
      return null;
    }
  }

  const profileKey = `${parsedId ?? ''}|${studentMajor}|${unitsPerSemester}|${[...passedUnits].sort().join(',')}|${[...enrolledUnits].sort().join(',')}|${[...failedUnits].sort().join(',')}`;

  async function generateRoadmap() {
    const id = validateId();
    if (!id || !studentMajor) return;
    setStudentPlan({ status: 'loading', key: profileKey });
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: 'start' }));
    try {
      if (studentLookup.status !== 'loaded' || activeStudentId !== id) {
        const saved = await saveProfile();
        if (!saved) {
          setStudentPlan({ status: 'idle' });
          return;
        }
      }
      const data = await api.planStudent(id, {
        major_override: studentMajor,
        units_per_semester: unitsPerSemester,
      });
      setStudentPlan({ status: 'done', data, key: profileKey });
    } catch (error) {
      setStudentPlan({ status: 'error', error, key: profileKey });
    }
  }

  const allUnits = useMemo(
    () => (studentMajor ? mergeUnitsForMajor(studentMajor, units.data?.units ?? []) : []),
    [studentMajor, units.data]
  );

  const shownUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allUnits.filter((u) => u.code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)) : allUnits;
  }, [allUnits, query]);

  const coreUnitsAll = useMemo(() => allUnits.filter((u) => u.category === 'core'), [allUnits]);
  const majorUnitsAll = useMemo(() => allUnits.filter((u) => u.category !== 'core'), [allUnits]);
  const coreShown = useMemo(() => shownUnits.filter((u) => u.category === 'core'), [shownUnits]);
  const majorShown = useMemo(() => shownUnits.filter((u) => u.category !== 'core'), [shownUnits]);

  const corePassedCount = useMemo(
    () => coreUnitsAll.filter((u) => passedUnits.has(u.code)).length,
    [coreUnitsAll, passedUnits]
  );
  const majorPassedCount = useMemo(
    () => majorUnitsAll.filter((u) => passedUnits.has(u.code)).length,
    [majorUnitsAll, passedUnits]
  );
  const selectedMajorName = majorList.find((m) => m.id === studentMajor)?.name || 'Selected';

  const getUnitStatus = (code) => {
    if (passedUnits.has(code)) return 'passed';
    if (enrolledUnits.has(code)) return 'enrolled';
    if (failedUnits.has(code)) return 'failed';
    return null;
  };

  const roadmapData = studentPlan.data;
  const failedSet = new Set(roadmapData?.failed_units ?? []);

  return (
    <div className="stack gap-12">
      <div className="two-col">
        <div className="stack gap-8">
          <div className="page-header">
            <h1 className="t-display">Current student profile</h1>
            <p className="t-body c-secondary">
              Look up your student record, assign passed, enrolled, and failed units, and generate a personalized
              semester roadmap.
            </p>
          </div>

          <section className="stack gap-3" aria-labelledby="cs-step-id">
            <h2 id="cs-step-id" className="t-label">
              1. Student ID lookup
            </h2>
            <div className="row wrap gap-3">
              <label className="field field--id">
                <span className="sr-only">Student ID</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter Student ID (e.g. 100001)"
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(e.target.value);
                    if (idError) setIdError('');
                  }}
                />
              </label>
              <Button
                variant="secondary"
                onClick={lookupStudent}
                disabled={studentLookup.status === 'loading'}
              >
                {studentLookup.status === 'loading' ? 'Looking up…' : 'Load profile'}
              </Button>
            </div>
            {idError && <p className="t-small c-danger">{idError}</p>}
            {studentLookup.status === 'loaded' && (
              <Banner tone="success" title={`Profile loaded for Student #${studentLookup.id}`}>
                Your saved major, career goals, and unit history are loaded below.
              </Banner>
            )}
            {studentLookup.status === 'new' && (
              <Banner tone="info" title={`New profile for Student #${studentLookup.id}`}>
                No existing record was found (404). Complete your details below and click Save profile to create it.
              </Banner>
            )}
            {studentLookup.status === 'error' && (
              <SystemError error={studentLookup.error} onRetry={lookupStudent} />
            )}
          </section>

          <section className="stack gap-3" aria-labelledby="cs-step-major">
            <h2 id="cs-step-major" className="t-label">
              2. Target major
            </h2>
            {majors.error ? (
              <SystemError error={majors.error} onRetry={majors.retry} />
            ) : (
              <div className="row wrap gap-2" aria-busy={majors.loading}>
                {majors.loading && <p className="t-small c-secondary">Loading majors…</p>}
                {majorList.map((m) => (
                  <MajorChip key={m.id} selected={m.id === studentMajor} onClick={() => selectStudentMajor(m.id)}>
                    {m.name}
                  </MajorChip>
                ))}
              </div>
            )}
          </section>

          <section className="stack gap-4" aria-labelledby="cs-step-goals">
            <h2 id="cs-step-goals" className="t-label">
              3. Career &amp; study goals
            </h2>
            <div className="goal-grid">
              <div className="stack gap-1">
                <label htmlFor="target-career-input" className="t-small">
                  Target career
                </label>
                <input
                  id="target-career-input"
                  className="text-input"
                  type="text"
                  placeholder="e.g. Machine Learning Engineer"
                  value={targetCareer}
                  onChange={(e) => setTargetCareer(e.target.value)}
                />
              </div>
              <div className="stack gap-1">
                <label htmlFor="study-goal-input" className="t-small">
                  Study goal
                </label>
                <input
                  id="study-goal-input"
                  className="text-input"
                  type="text"
                  placeholder="e.g. Graduate on time"
                  value={studyGoal}
                  onChange={(e) => setStudyGoal(e.target.value)}
                />
              </div>
            </div>
            <div className="stack gap-2">
              <span className="t-small">Units per semester</span>
              <div className="row gap-2" role="group" aria-label="Units per semester">
                {[3, 4].map((count) => (
                  <MajorChip
                    key={count}
                    selected={unitsPerSemester === count}
                    onClick={() => setUnitsPerSemester(count)}
                  >
                    {count} units / semester
                  </MajorChip>
                ))}
              </div>
            </div>
          </section>

          <section className="stack gap-3" aria-labelledby="cs-step-units">
            <div className="row between wrap gap-3">
              <h2 id="cs-step-units" className="t-label">
                4. Unit history (mutually exclusive)
              </h2>
              <span className="t-caption c-secondary" aria-live="polite">
                {passedUnits.size} Passed · {enrolledUnits.size} Enrolled · {failedUnits.size} Failed / Retake
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
              <div className="stack gap-6" aria-busy={units.loading}>
                {units.loading && <p className="t-small c-secondary">Loading units…</p>}
                {[
                  {
                    key: 'core',
                    title: 'Computer Science Core Units',
                    badge: 'Core',
                    list: coreShown,
                    passed: corePassedCount,
                    total: coreUnitsAll.length,
                    alwaysShow: false,
                  },
                  {
                    key: 'major',
                    title: `${selectedMajorName} Major Units`,
                    badge: 'Major',
                    list: majorShown,
                    passed: majorPassedCount,
                    total: majorUnitsAll.length,
                    alwaysShow: !query.trim() && units.data != null,
                  },
                ]
                  .filter((group) => group.list.length > 0 || group.alwaysShow)
                  .map((group) => (
                    <section key={group.key} className="unit-group" aria-label={group.title}>
                      <div className="unit-group__header">
                        <div className="row gap-2">
                          <h3 className="t-label">{group.title}</h3>
                          <span className={`cat-pill cat-pill--${group.key} t-caption`}>{group.badge}</span>
                        </div>
                        <span className="t-caption c-secondary">
                          {group.badge}: {group.passed}/{group.total} passed
                        </span>
                      </div>
                      {group.list.length === 0 ? (
                        <p className="t-small c-secondary">
                          Additional major units will appear once added to the curriculum database.
                        </p>
                      ) : (
                        <div className="cs-unit-list">
                          {group.list.map((u) => {
                            const status = getUnitStatus(u.code);
                            return (
                              <div key={u.code} className={`cs-unit-row${status ? ` cs-unit-row--${status}` : ''}`}>
                                <div className="stack">
                                  <div className="row gap-2">
                                    <span className="t-caption c-secondary">
                                      {u.code} · {u.credit_points} cp
                                    </span>
                                    <span className={`cat-pill cat-pill--${group.key} t-caption`}>{group.badge}</span>
                                  </div>
                                  <span className="t-body-strong">{u.name}</span>
                                </div>
                                <div className="cs-unit-actions" role="group" aria-label={`Status for ${u.code}`}>
                                  {UNIT_STATUS_OPTIONS.map((opt) => (
                                    <button
                                      key={opt.key}
                                      type="button"
                                      className={`status-pill status-pill--${opt.key}`}
                                      aria-pressed={status === opt.key}
                                      onClick={() => assignUnitStatus(u.code, opt.key)}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  ))}
                {units.data && shownUnits.length === 0 && (
                  <p className="t-small c-secondary">{`No unit matches "${query}".`}</p>
                )}
              </div>
            )}
          </section>

          {studentSave.status === 'saved' && (
            <Banner tone="success" title="Profile saved">
              Saved academic profile for Student #{studentSave.id}.
            </Banner>
          )}
          {studentSave.status === 'error' && <SystemError error={studentSave.error} onRetry={saveProfile} />}

          <div className="row wrap gap-3">
            <Button
              onClick={generateRoadmap}
              disabled={!studentMajor || studentPlan.status === 'loading' || studentSave.status === 'saving'}
            >
              {studentPlan.status === 'loading'
                ? 'Generating…'
                : studentPlan.status === 'done'
                  ? 'Update roadmap'
                  : 'Generate roadmap'}
            </Button>
            <Button
              variant="secondary"
              onClick={saveProfile}
              disabled={!studentMajor || studentSave.status === 'saving'}
            >
              {studentSave.status === 'saving' ? 'Saving…' : 'Save profile'}
            </Button>
            <Button variant="ghost" onClick={clearStudentUnits}>
              Clear unit history
            </Button>
          </div>
        </div>

        <aside className="stack gap-6">
          <div className="card">
            <h2 className="t-h2">Current student advising</h2>
            <p className="t-small c-secondary">
              Your Student ID links your roadmap and syllabus chat to your real academic history: passed units, active
              enrolments, and retakes.
            </p>
            <ol className="t-small stack gap-3 steps">
              <li>Look up or create your Student ID</li>
              <li>Mark passed, enrolled, and failed units</li>
              <li>Generate a prioritized retake-aware roadmap</li>
              <li>Inspect the prerequisite DAG and ask the AI advisor</li>
            </ol>
          </div>
        </aside>
      </div>

      {studentPlan.status !== 'idle' && (
        <section ref={resultsRef} className="stack gap-6 results" aria-labelledby="cs-results-title">
          <div className="page-header page-header--actions">
            <div>
              <h2 id="cs-results-title" className="t-h1">
                Semester roadmap &amp; prerequisite graph
              </h2>
              <p className="t-body c-secondary">
                {roadmapData
                  ? `${roadmapData.major?.name ?? studentMajor} major · ${roadmapData.completed_units?.length ?? 0} passed · ${roadmapData.enrolled_units?.length ?? 0} enrolled · ${roadmapData.failed_units?.length ?? 0} retake`
                  : 'Calculating personalized roadmap'}
              </p>
            </div>
            <Button as="a" href="#ask">
              Ask about this roadmap
            </Button>
          </div>

          {studentPlan.status === 'done' && studentPlan.key !== profileKey && (
            <Banner tone="info" title="Your profile changed">
              Press Update roadmap to recalculate the plan.
            </Banner>
          )}

          {studentPlan.status === 'loading' && <PathwaySkeleton />}
          {studentPlan.status === 'error' &&
            (studentPlan.error.code === 'CURRICULUM_CYCLE' ? (
              <CurriculumError error={studentPlan.error} />
            ) : (
              <SystemError error={studentPlan.error} onRetry={generateRoadmap} />
            ))}

          {studentPlan.status === 'done' && roadmapData && (
            <div className="stack gap-8">
              {roadmapData.violations === 0 ? (
                <Banner tone="success" title="Prerequisite check passed · 0 violations">
                  Every planned unit has its prerequisites satisfied by passed units or earlier semesters.
                </Banner>
              ) : (
                <Banner tone="danger" title={`Prerequisite check failed · ${roadmapData.violations} violations`}>
                  This plan breaks prerequisite rules. Consult an academic advisor.
                </Banner>
              )}

              {roadmapData.semesters.length === 0 && roadmapData.blocked_units.length === 0 ? (
                <Banner tone="success" title="All major requirements complete">
                  You have passed or enrolled in every required unit for this major.
                </Banner>
              ) : (
                <div className="semesters">
                  {roadmapData.semesters.map((s) => (
                    <section key={s.index} className="semester" aria-label={s.name}>
                      <div className="row between">
                        <h3 className="t-label">{s.name}</h3>
                        <span className="t-caption c-secondary">
                          {s.units.length} units · {s.credit_points} cp
                        </span>
                      </div>
                      {s.units.map((u) => {
                        const isRetake = Boolean(u.is_retake) || failedSet.has(u.code);
                        return (
                          <UnitCard
                            key={u.code}
                            status={isRetake ? 'retake' : 'planned'}
                            category={getUnitCategory(u.code, studentMajor)}
                            code={u.code}
                            name={u.name}
                            rank={u.rank}
                            badge={isRetake ? 'Retake Required' : undefined}
                            note={`${u.credit_points} cp${u.reason ? ` · ${u.reason}` : ''}`}
                          />
                        );
                      })}
                    </section>
                  ))}

                  {roadmapData.blocked_units.length > 0 && (
                    <section className="semester semester--blocked" aria-label="Blocked units">
                      <div className="row gap-2 c-danger">
                        <Icon name="alert" size={16} />
                        <h3 className="t-label">Blocked units</h3>
                      </div>
                      {roadmapData.blocked_units.map((u) => (
                        <div key={u.code} className="stack gap-2">
                          <UnitCard
                            status="blocked"
                            code={u.code}
                            name={u.name}
                            note={
                              u.missing_prereqs?.length
                                ? `Blocked: needs ${u.missing_prereqs.join(', ')}`
                                : 'Outside the current plan'
                            }
                          />
                          {u.available_after && (
                            <p className="t-caption c-secondary">Becomes available after {u.available_after}.</p>
                          )}
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              )}

              {roadmapData.dag_graph && <DagGraph graph={roadmapData.dag_graph} />}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
