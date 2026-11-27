import { describe, expect, it } from 'vitest';
import { addTerms, nextTerm, termLabel, upcomingTerms } from './terms.js';
import {
  buildPlanView,
  describeMissing,
  estimateWam,
  findViolations,
  missingPrereqs,
  prerequisitePath,
  swapOptions,
} from './plan.js';
import { EDGES, recommend, SAMPLE_PROFILE } from '../api/mock.js';
import { planBody } from '../api/client.js';
import { getUnitCategory } from '../data/csMajors.js';

const edge = (source, target, rule_type = 'AND') => ({ source, target, rule_type });

describe('terms', () => {
  it('runs January, May and September, and rolls into the next year', () => {
    expect(termLabel(nextTerm(new Date(2026, 10, 26)))).toBe('January 2027');
    expect(termLabel(nextTerm(new Date(2027, 0, 10)))).toBe('May 2027');
    expect(termLabel(nextTerm(new Date(2027, 4, 1)))).toBe('September 2027');
    expect(termLabel(addTerms({ year: 2027, index: 2 }, 2))).toBe('May 2028');
    expect(upcomingTerms(3, new Date(2026, 10, 26)).map(termLabel)).toEqual([
      'January 2027',
      'May 2027',
      'September 2027',
    ]);
  });
});

describe('prerequisite rules', () => {
  const edges = [edge('A', 'C'), edge('B', 'C'), edge('X', 'D', 'OR'), edge('Y', 'D', 'OR'), edge('Z', 'D', 'ASSUMED')];

  it('needs every AND unit, one OR unit, and ignores ASSUMED knowledge', () => {
    expect(missingPrereqs('C', new Set(['A']), edges)).toEqual(['B']);
    expect(missingPrereqs('D', new Set(), edges)).toEqual([['X', 'Y']]);
    expect(missingPrereqs('D', new Set(['Y']), edges)).toEqual([]);
    expect(describeMissing([['X', 'Y'], 'B'])).toBe('X or Y and B');
  });

  it('flags a unit placed in the same term as its prerequisite', () => {
    expect(findViolations([['A', 'B', 'C']], [], edges)).toEqual([{ code: 'C', index: 0, missing: ['A', 'B'] }]);
    expect(findViolations([['A', 'B'], ['C']], [], edges)).toEqual([]);
  });

  it('offers only swaps that keep every rule', () => {
    const plan = [
      ['A', 'E'],
      ['C', 'F'],
    ];
    const rules = [edge('A', 'C')];
    // Moving A next to C (or after it) breaks C's rule; F has no rules, so it can trade with E.
    expect(swapOptions(plan, 'A', [], rules)).toEqual([]);
    expect(swapOptions(plan, 'E', [], rules)).toEqual(['F']);
  });
});

describe('estimateWam', () => {
  it('averages band midpoints and names the band', () => {
    expect(estimateWam([])).toBeNull();
    expect(estimateWam(['HD', 'C'])).toEqual({ value: 77.3, band: 'Distinction', count: 2 });
  });
});

describe('buildPlanView with the sample student', async () => {
  const start = { year: 2027, index: 0 };
  const response = await recommend(planBody(SAMPLE_PROFILE, 3));
  const view = buildPlanView(response, SAMPLE_PROFILE, {
    start,
    load: 3,
    category: (c) => getUnitCategory(c, 'artificial-intelligence'),
  });

  it('puts the retake first and keeps every prerequisite', () => {
    expect(view.current[0]).toMatchObject({ code: 'COS20007', retake: true, critical: true });
    expect(view.current.filter((u) => u.critical)).toHaveLength(1);
    expect(view.violations).toEqual([]);
    // COS30018 is open through COS20011, which is passed, so the retake reason must not name it.
    expect(view.current[0].reason).toMatch(/^Retake first\. You need it before COS30019 and \d+ later units\.$/);
  });

  it('counts credit points, WAM and the graduation term', () => {
    expect(view.stats).toMatchObject({ passedCp: 100, passedCount: 8, retakeCount: 1, year: 2 });
    expect(view.stats.wam.count).toBe(8);
    // 16 units left at 3 a term is 6 terms: January 2027 to September 2028.
    expect(view.stats.unitsRemaining).toBe(16);
    expect(view.stats.graduation).toBe('September 2028');
    expect(view.stats.finishEarly).toBe('May 2028');
    expect(view.roadmap.reduce((n, t) => n + t.units.length + t.electives, 0)).toBe(16);
  });

  it('says when a waiting unit opens, from the earliest term its prerequisites allow', () => {
    const ai = view.notYetEligible.find((u) => u.code === 'COS30019');
    expect(describeMissing(ai.missing)).toBe('COS20007 or COS30008');
    expect(termLabel(ai.from)).toBe('May 2027');
  });

  it('walks a prerequisite path back to a passed unit and forward through the plan', () => {
    const path = prerequisitePath('COS20007', view, SAMPLE_PROFILE);
    expect(path[0]).toBe('COS10009');
    expect(path[1]).toBe('COS20007');
    expect(path.length).toBeGreaterThan(2);
    for (let i = 1; i < path.length; i++)
      expect(EDGES.some((e) => e.source === path[i - 1] && e.target === path[i])).toBe(true);
  });

  it('applies a swap and still passes the prerequisite check', () => {
    const [first] = view.current;
    const other = view.current[1].swaps[0];
    expect(first.swaps.length + view.current[1].swaps.length).toBeGreaterThan(0);
    if (!other) return;
    const swapped = buildPlanView(response, SAMPLE_PROFILE, {
      start,
      swaps: [[view.current[1].code, other.code]],
      category: () => 'elective',
    });
    expect(swapped.semesters[0]).toContain(other.code);
    expect(swapped.violations).toEqual([]);
  });
});

describe('buildPlanView edge cases', () => {
  const start = { year: 2027, index: 0 };
  const profile = { major: 'x', units: {} };
  const response = {
    semesters: [{ units: [{ code: 'A' }] }, { units: [{ code: 'C' }] }],
    blocked_units: [{ code: 'B', name: 'Blocked', missing_prereqs: ['OUTSIDE1'] }],
    dag_graph: { edges: [edge('A', 'C')] },
  };
  const build = (opts) => buildPlanView(response, profile, { start, category: () => 'core', ...opts });

  it('ignores a saved swap whose unit is no longer in the plan', () => {
    expect(build({ swaps: [['A', 'GONE']] }).semesters).toEqual([['A'], ['C']]);
  });

  it('still finishes when the load is 0, planning at least one unit a term', () => {
    expect(build({ load: 0 }).stats.semestersLeft).toBeGreaterThan(2);
  });

  it("falls back to the backend's missing prerequisites for a blocked unit", () => {
    expect(build({}).notYetEligible.find((u) => u.code === 'B').missing).toEqual(['OUTSIDE1']);
  });
});
