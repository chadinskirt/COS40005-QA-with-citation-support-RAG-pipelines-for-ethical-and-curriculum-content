import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as mock from './mock.js';
import { CS_MAJORS } from '../data/csMajors.js';
import { findViolations } from '../lib/plan.js';

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
const body = (major, completed = [], extra = {}) => ({ major, completed_units: completed, ...extra });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('mock.recommend', () => {
  it('keeps every prerequisite for every major and load', async () => {
    for (const { id } of CS_MAJORS) {
      for (const load of [2, 3, 4]) {
        const plan = await settle(mock.recommend(body(id, ['COS10009'], { units_per_semester: load })));
        const terms = plan.semesters.map((s) => s.units.map((u) => u.code));
        expect(findViolations(terms, ['COS10009'], plan.dag_graph.edges)).toEqual([]);
        expect(terms.every((t) => t.length <= load)).toBe(true);
      }
    }
  });

  it('puts a failed unit first and marks it as a retake', async () => {
    const plan = await settle(
      mock.recommend(body('artificial-intelligence', ['COS10009'], { failed_units: ['COS20007'] }))
    );
    expect(plan.semesters[0].units[0]).toMatchObject({ code: 'COS20007', is_retake: true, rank: 1 });
    expect(plan.dag_graph.nodes.find((n) => n.id === 'COS20007').status).toBe('retake');
  });

  it('counts enrolled units as done for prerequisites', async () => {
    const plan = await settle(
      mock.recommend(body('artificial-intelligence', ['COS10009'], { enrolled_units: ['COS20007'] }))
    );
    const terms = plan.semesters.map((s) => s.units.map((u) => u.code));
    expect(terms.flat()).not.toContain('COS20007');
    // COS30019 needs COS20007 or COS30008; being enrolled in COS20007 is enough.
    expect(findViolations(terms, ['COS10009', 'COS20007'], plan.dag_graph.edges)).toEqual([]);
    expect(findViolations(terms, ['COS10009'], plan.dag_graph.edges).map((v) => v.code)).toContain('SWE30003');
  });

  it('rejects unknown units and supports the cycle and down switches', async () => {
    await expect(settle(mock.recommend(body('data-science', ['NOPE1234'])))).rejects.toMatchObject({ status: 422 });
    window.history.replaceState(null, '', '/?mock=cycle');
    await expect(settle(mock.recommend(body('data-science')))).rejects.toMatchObject({ code: 'CURRICULUM_CYCLE' });
    window.history.replaceState(null, '', '/?mock=down');
    await expect(settle(mock.getMajors())).rejects.toMatchObject({ status: 503 });
  });
});

describe('mock.chat', () => {
  const ask = (question, history = []) => settle(mock.chat({ question, history, scope: ['outlines', 'plan'] }));

  it('answers with numbered citations that exist', async () => {
    const r = await ask('Can I take COS30019 next semester?');
    expect(r.abstained).toBe(false);
    const refs = [...r.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    expect(Math.max(...refs)).toBeLessThanOrEqual(r.citations.length);
  });

  it('asks which unit is meant, then answers the follow-up', async () => {
    const q = await ask('How do I pass the AI unit?');
    expect(q.needs_clarification).toBe(true);
    expect(q.options.map((o) => o.code)).toEqual(['COS30019', 'COS30018', 'COS40007']);
    const a = await ask('Yes, COS30019 Introduction to Artificial Intelligence', [
      { role: 'user', content: 'How do I pass the AI unit?' },
      { role: 'assistant', content: q.answer },
    ]);
    expect(a.answer).toMatch(/^## Passing COS30019/);
  });

  it('abstains differently for out-of-scope, unknown unit and weak matches', async () => {
    expect((await ask('Can credits from another university count?')).abstain_reason).toBe('OUT_OF_SCOPE');
    expect(await ask('What is COS49999 about?')).toMatchObject({ abstain_reason: 'UNIT_NOT_FOUND', unit: 'COS49999' });
    const weak = await ask('What is the meaning of life?');
    expect(weak).toMatchObject({ abstained: true, abstain_reason: 'LOW_SIMILARITY' });
    expect(weak.citations).toHaveLength(1);
  });
});
