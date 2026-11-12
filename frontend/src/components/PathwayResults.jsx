import Banner from './Banner.jsx';
import Icon from './Icon.jsx';
import UnitCard from './UnitCard.jsx';
import { CurriculumError, PathwaySkeleton, SystemError } from './States.jsx';

// Result of POST /api/recommend.
export default function PathwayResults({ state, onRetry }) {
  if (state.status === 'loading') return <PathwaySkeleton />;
  if (state.status === 'error') {
    return state.error.code === 'CURRICULUM_CYCLE' ? (
      <CurriculumError error={state.error} />
    ) : (
      <SystemError error={state.error} onRetry={onRetry} />
    );
  }

  const d = state.data;
  const nothingLeft = d.semesters.length === 0 && d.blocked_units.length === 0;
  return (
    <div className="stack gap-6">
      {d.violations === 0 ? (
        <Banner tone="success" title="Prerequisite check passed · 0 violations">
          Every planned unit has all of its prerequisites placed in an earlier semester.
        </Banner>
      ) : (
        <Banner tone="danger" title={`Prerequisite check failed · ${d.violations} violations`}>
          This plan breaks prerequisite rules and must not be used. Report it to the team.
        </Banner>
      )}

      {nothingLeft ? (
        <Banner tone="success" title="Nothing left to plan">
          You have completed every required unit for this major.
        </Banner>
      ) : (
        <div className="semesters">
          {d.semesters.map((s) => (
            <section key={s.index} className="semester" aria-label={s.name}>
              <div className="row between">
                <h3 className="t-label">{s.name}</h3>
                <span className="t-caption c-secondary">
                  {s.units.length} units · {s.credit_points} cp
                </span>
              </div>
              {s.units.map((u) => (
                <UnitCard
                  key={u.code}
                  code={u.code}
                  name={u.name}
                  rank={u.rank}
                  note={`${u.credit_points} cp · ${u.reason}`}
                />
              ))}
            </section>
          ))}
          {d.blocked_units.length > 0 && (
            <section className="semester semester--blocked" aria-label="Not eligible yet">
              <div className="row gap-2 c-danger">
                <Icon name="alert" size={16} />
                <h3 className="t-label">Not eligible yet</h3>
              </div>
              {d.blocked_units.map((u) => (
                <div key={u.code} className="stack gap-2">
                  <UnitCard
                    status="blocked"
                    code={u.code}
                    name={u.name}
                    note={
                      u.missing_prereqs.length
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

      <Banner tone="info" title="Why this order?">
        Units sit in a prerequisite graph and are placed only after all their prerequisites. Within a semester, #1
        unlocks the most later units, so take it first. A blocked unit names what is missing.
      </Banner>
    </div>
  );
}
