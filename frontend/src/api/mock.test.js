import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mock from './mock.js';

// The mock waits before answering; fake timers skip the wait.
const settle = async (promise) => {
  const result = promise.then(
    (v) => ({ v }),
    (e) => ({ e })
  );
  await vi.runAllTimersAsync();
  const { v, e } = await result;
  if (e) throw e;
  return v;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

const FOUNDATION = ['COS10009', 'COS10004', 'MAT10004', 'COS20015'];

describe('mock.recommend', () => {
  it('places every unit after its prerequisites and reports 0 violations', async () => {
    const plan = await settle(mock.recommend('artificial-intelligence', FOUNDATION));
    expect(plan.violations).toBe(0);
    const semesterOf = {};
    plan.semesters.forEach((s) => s.units.forEach((u) => (semesterOf[u.code] = s.index)));
    expect(semesterOf.COS30019).toBeGreaterThan(semesterOf.COS20007);
  });

  it('ranks units from 1 inside each semester', async () => {
    const plan = await settle(mock.recommend('artificial-intelligence', FOUNDATION));
    plan.semesters.forEach((s) => expect(s.units.map((u) => u.rank)).toEqual(s.units.map((_, i) => i + 1)));
  });

  it('puts foundation units in the plan when none are completed', async () => {
    const plan = await settle(mock.recommend('artificial-intelligence', []));
    const planned = plan.semesters.flatMap((s) => s.units.map((u) => u.code));
    expect(planned).toContain('COS10009');
  });

  it('returns an empty plan when everything is done', async () => {
    const all = [...FOUNDATION, 'COS20007', 'COS20019', 'COS30008', 'COS30019', 'COS30018', 'COS30082', 'COS30049'];
    const plan = await settle(mock.recommend('artificial-intelligence', all));
    expect(plan.semesters).toEqual([]);
    expect(plan.blocked_units).toEqual([]);
  });

  it('sets available_after only when every missing prerequisite is planned', async () => {
    const majors = ['artificial-intelligence', 'software-development', 'cybersecurity', 'data-science'];
    // Every subset of the foundation units, for every major.
    const subsets = Array.from({ length: 16 }, (_, n) => FOUNDATION.filter((_, i) => n & (1 << i)));
    for (const major of majors) {
      for (const done of subsets) {
        const plan = await settle(mock.recommend(major, done));
        const semesterOf = {};
        plan.semesters.forEach((s) => s.units.forEach((u) => (semesterOf[u.code] = s.index)));
        plan.blocked_units.forEach((b) => {
          const planned = b.missing_prereqs.length > 0 && b.missing_prereqs.every((p) => semesterOf[p]);
          const last = planned ? Math.max(...b.missing_prereqs.map((p) => semesterOf[p])) : null;
          expect(b.available_after).toBe(last ? `Semester ${last}` : null);
        });
      }
    }
  });

  it('rejects an unknown major and unknown units', async () => {
    await expect(settle(mock.recommend('nope', []))).rejects.toMatchObject({ code: 'UNKNOWN_MAJOR', status: 404 });
    await expect(settle(mock.recommend('data-science', ['XXX999']))).rejects.toMatchObject({ code: 'UNKNOWN_UNIT' });
  });

  it('fails with a cycle error under ?mock=cycle', async () => {
    window.history.replaceState(null, '', '/?mock=cycle');
    await expect(settle(mock.recommend('data-science', []))).rejects.toMatchObject({
      status: 409,
      code: 'CURRICULUM_CYCLE',
    });
  });
});

describe('mock.chat', () => {
  it('answers with citations that passed the threshold', async () => {
    const r = await settle(mock.chat('What do I need to pass COS30019?'));
    expect(r.abstained).toBe(false);
    expect(r.citations.length).toBeGreaterThan(0);
    r.citations.forEach((c) => expect(c.similarity).toBeGreaterThanOrEqual(r.threshold));
  });

  it('abstains out of scope and on low similarity, with no answer or citations', async () => {
    const scope = await settle(mock.chat('Can credits from another university count?'));
    expect(scope).toMatchObject({ abstained: true, abstain_reason: 'OUT_OF_SCOPE', answer: null, citations: [] });
    const low = await settle(mock.chat('What is the weather like?'));
    expect(low).toMatchObject({ abstained: true, abstain_reason: 'LOW_SIMILARITY' });
  });

  it('fails with a 503 under ?mock=down', async () => {
    window.history.replaceState(null, '', '/?mock=down');
    await expect(settle(mock.chat('anything'))).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });
});
