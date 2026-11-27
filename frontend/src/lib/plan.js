// Turns a /recommend response into what the Plan semester page shows.
// The backend schedules units; this file only checks, labels and lays them out.
import { addTerms, termLabel } from './terms.js';

export const DEGREE_CP = 300;
export const UNIT_CP = 12.5;
export const STANDARD_LOAD = 3;

// Mid-band marks used to estimate WAM from letter grades (Swinburne bands).
export const GRADES = { HD: 90, D: 74.5, C: 64.5, P: 54.5 };
const BANDS = [
  [80, 'High Distinction'],
  [70, 'Distinction'],
  [60, 'Credit'],
  [50, 'Pass'],
  [0, 'Below pass'],
];

// Edges are { source, target, rule_type }. Only AND and OR rules gate enrolment, the same as
// service/recommender.py; ASSUMED is assumed knowledge and is not enforced.
export function prereqsOf(code, edges) {
  const and = [];
  const or = [];
  for (const e of edges) {
    if (e.target !== code) continue;
    const rule = (e.rule_type || 'AND').toUpperCase();
    if (rule === 'AND') and.push(e.source);
    else if (rule === 'OR') or.push(e.source);
  }
  return { and, or };
}

// Missing prerequisites of code given the units already done. Empty means eligible.
export function missingPrereqs(code, done, edges) {
  const { and, or } = prereqsOf(code, edges);
  const missing = and.filter((p) => !done.has(p));
  if (or.length && !or.some((p) => done.has(p))) missing.push(or);
  return missing; // strings for AND rules, one array for the OR group
}

// "COS20007 and COS10026", "COS20007 or COS30008"
export function describeMissing(missing) {
  return missing.map((m) => (Array.isArray(m) ? m.join(' or ') : m)).join(' and ');
}

// semesters: arrays of codes in order. Returns [{ code, index, missing }].
export function findViolations(semesters, base, edges) {
  const done = new Set(base);
  const out = [];
  semesters.forEach((codes, index) => {
    for (const code of codes) {
      const missing = missingPrereqs(code, done, edges);
      if (missing.length) out.push({ code, index, missing });
    }
    codes.forEach((c) => done.add(c));
  });
  return out;
}

export function applySwap(semesters, a, b) {
  return semesters.map((codes) => codes.map((c) => (c === a ? b : c === b ? a : c)));
}

// Later units that can trade places with code without breaking any prerequisite.
export function swapOptions(semesters, code, base, edges) {
  return semesters
    .slice(1)
    .flat()
    .filter((other) => findViolations(applySwap(semesters, code, other), base, edges).length === 0);
}

// Units in `within` that need code, directly or not.
export function dependentsOf(code, edges, within) {
  const seen = new Set();
  const stack = [code];
  while (stack.length) {
    const c = stack.pop();
    for (const e of edges) {
      if (e.source === c && within.has(e.target) && !seen.has(e.target)) {
        seen.add(e.target);
        stack.push(e.target);
      }
    }
  }
  return seen;
}

// Longest prerequisite chain starting at code, counted in units, inside `within`.
function chainDepth(code, edges, within, memo = new Map()) {
  if (memo.has(code)) return memo.get(code);
  memo.set(code, 1); // guards against cycles in bad data
  const next = edges.filter((e) => e.source === code && within.has(e.target)).map((e) => e.target);
  const d = 1 + Math.max(0, ...next.map((n) => chainDepth(n, edges, within, memo)));
  memo.set(code, d);
  return d;
}

export function estimateWam(grades) {
  const marks = grades.map((g) => GRADES[g]).filter((m) => m != null);
  if (!marks.length) return null;
  const value = Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 10) / 10;
  return { value, band: BANDS.find(([min]) => value >= min)[1], count: marks.length };
}

const MAJOR_SHORT = { 'artificial-intelligence': 'AI' };
const listWords = (codes) =>
  codes.length < 2 ? codes.join('') : `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;

// One or two plain sentences on why a unit is in this semester.
export function reasonFor(unit, { profile, edges, majorId, majorName, unlocks, firstDependent }) {
  if (unit.retake) {
    if (!unlocks) return 'Retake first. You need to pass it to graduate.';
    const rest = unlocks - 1;
    return `Retake first. You need it before ${firstDependent}${rest ? ` and ${rest} later unit${rest > 1 ? 's' : ''}` : ''}.`;
  }
  const { and, or } = prereqsOf(unit.code, edges);
  const status = (c) => profile.units[c]?.status;
  const met = [...and, ...or.filter((p) => status(p) === 'passed' || status(p) === 'enrolled').slice(0, 1)];
  let pre = '';
  if (met.length) {
    const passed = met.every((c) => status(c) === 'passed');
    const verb =
      met.length > 1 ? (passed ? 'are passed' : 'are done or in progress') : passed ? 'is passed' : 'is in progress';
    pre = ` Its prerequisite${met.length > 1 ? 's' : ''}, ${listWords(met)}, ${verb}.`;
  }
  if (unit.category === 'major') return `Required for the ${MAJOR_SHORT[majorId] ?? majorName} major.${pre}`;
  if (unit.category === 'core') return `A core unit every Computer Science student takes.${pre}`;
  return `An elective you can take now.${pre || ' It has no prerequisites.'}`;
}

/**
 * @param response  /recommend response (semesters, blocked_units, dag_graph)
 * @param profile   { major, units: { CODE: { status: 'passed'|'failed'|'enrolled', grade? } } }
 * @param opts      { start: term, load, swaps: [[a, b]], names: { CODE: name }, category(code) }
 */
export function buildPlanView(response, profile, { start, load = STANDARD_LOAD, swaps = [], names = {}, category }) {
  const edges = response.dag_graph?.edges ?? [];
  const info = {};
  for (const s of response.semesters) for (const u of s.units) info[u.code] = u;
  const nameOf = (c) => info[c]?.name ?? names[c] ?? c;
  const cpOf = (c) => info[c]?.credit_points ?? UNIT_CP;

  const codesBy = (status) => Object.keys(profile.units).filter((c) => profile.units[c].status === status);
  const passed = codesBy('passed');
  const enrolled = codesBy('enrolled');
  const failed = new Set([...codesBy('failed'), ...(response.failed_units ?? [])]);
  const base = [...passed, ...enrolled];

  let semesters = response.semesters.map((s) => s.units.map((u) => u.code));
  // A saved swap only applies while both units are still in the plan the backend returned.
  for (const [a, b] of swaps) {
    const flat = semesters.flat();
    if (flat.includes(a) && flat.includes(b)) semesters = applySwap(semesters, a, b);
  }

  const planned = new Set(semesters.flat());
  const termOf = {};
  semesters.forEach((codes, i) => codes.forEach((c) => (termOf[c] = addTerms(start, i))));

  // Electives fill the free slots until the degree reaches 300 credit points.
  const doneCp = base.reduce((sum, c) => sum + cpOf(c), 0);
  const blocked = response.blocked_units ?? [];
  const neededUnits = Math.max(0, Math.ceil((DEGREE_CP - doneCp) / UNIT_CP));
  let electives = Math.max(0, neededUnits - planned.size - blocked.length);
  const terms = semesters.map((codes, i) => {
    const extra = Math.min(electives, Math.max(0, load - codes.length));
    electives -= extra;
    return { term: addTerms(start, i), codes, electives: extra };
  });
  while (electives > 0) {
    const extra = Math.min(electives, Math.max(1, load)); // like the backend, never fewer than 1 a term
    electives -= extra;
    terms.push({ term: addTerms(start, terms.length), codes: [], electives: extra });
  }
  const slots = terms.reduce((n, t) => n + t.codes.length + t.electives, 0);
  const last = terms[terms.length - 1];
  // A lone elective in the last term could move into an earlier one with approval for a 4-unit load.
  const finishEarly =
    terms.length > 1 && last.codes.length === 0 && last.electives === 1 && load === STANDARD_LOAD
      ? terms[terms.length - 2].term
      : null;

  const remaining = new Set([...planned, ...blocked.map((b) => b.code)]);
  const baseSet = new Set(base);
  // Edges that still gate a unit: AND rules, and OR rules not already met by a passed or enrolled unit.
  const gating = edges.filter((e) => {
    const rule = (e.rule_type || 'AND').toUpperCase();
    return rule === 'AND' || (rule === 'OR' && !prereqsOf(e.target, edges).or.some((p) => baseSet.has(p)));
  });
  const depthMemo = new Map();
  const depth = (c) => chainDepth(c, gating, remaining, depthMemo);
  // Only the unit heading the longest remaining chain is marked; delaying it delays everything after it.
  const lead = [...(semesters[0] ?? [])].sort(
    (a, b) => depth(b) - depth(a) || dependentsOf(b, gating, remaining).size - dependentsOf(a, gating, remaining).size
  )[0];

  const unit = (code) => ({
    code,
    name: nameOf(code),
    cp: cpOf(code),
    retake: failed.has(code),
    category: category(code),
  });

  const current = (semesters[0] ?? []).map((code) => {
    const u = unit(code);
    // Dependents in plan order, so the reason names the next one first.
    const order = (c) => semesters.findIndex((s) => s.includes(c));
    const deps = [...dependentsOf(code, gating, remaining)].sort((x, y) => order(x) - order(y) || x.localeCompare(y));
    const direct = gating.filter((e) => e.source === code && remaining.has(e.target)).map((e) => e.target);
    return {
      ...u,
      unlocks: deps.length,
      dependents: direct,
      critical: code === lead && depth(code) > 2,
      reason: reasonFor(u, {
        profile,
        edges,
        majorId: response.major?.id,
        majorName: response.major?.name,
        unlocks: deps.length,
        firstDependent: deps[0],
      }),
      prereqs: prereqsOf(code, edges),
      swaps: swapOptions(semesters, code, base, edges).map(unit),
    };
  });

  // Planned for later because a prerequisite is still missing today. `from` is the first term the
  // missing prerequisites allow, which can be earlier than where the planner put the unit.
  const today = new Set(base);
  const indexOf = (c) => semesters.findIndex((s) => s.includes(c));
  const readyAfter = (missing) => {
    const ready = missing.map((m) =>
      Array.isArray(m) ? Math.min(...m.map(indexOf).filter((i) => i >= 0)) : indexOf(m) >= 0 ? indexOf(m) : Infinity
    );
    const i = Math.max(...ready);
    return Number.isFinite(i) ? addTerms(start, i + 1) : null;
  };
  const waiting = semesters
    .slice(1)
    .flat()
    .map((code) => ({ ...unit(code), missing: missingPrereqs(code, today, edges) }))
    .filter((u) => u.missing.length)
    .map((u) => ({ ...u, from: readyAfter(u.missing) }));
  const notYetEligible = [
    ...waiting,
    ...blocked.map((b) => {
      // dag_graph only has edges inside the major, so fall back to what the backend says is missing.
      const missing = missingPrereqs(b.code, today, edges);
      return {
        ...unit(b.code),
        name: b.name ?? nameOf(b.code),
        missing: missing.length ? missing : (b.missing_prereqs ?? []),
        from: null,
      };
    }),
  ];

  const grades = passed.map((c) => profile.units[c].grade).filter(Boolean);
  const passedCp = passed.reduce((sum, c) => sum + cpOf(c), 0);

  return {
    major: response.major,
    edges,
    unit,
    termOf,
    semesters,
    current,
    currentCp: (semesters[0] ?? []).reduce((sum, c) => sum + cpOf(c), 0) + (terms[0]?.electives ?? 0) * UNIT_CP,
    currentElectives: terms[0]?.electives ?? 0,
    violations: findViolations(semesters, base, edges),
    roadmap: terms.map((t, i) => ({ ...t, label: termLabel(t.term), units: t.codes.map(unit), current: i === 0 })),
    notYetEligible,
    stats: {
      passedCp,
      progress: Math.min(1, passedCp / DEGREE_CP),
      passedCount: passed.length,
      retakeCount: [...failed].filter((c) => !passed.includes(c)).length,
      enrolledCount: enrolled.length,
      wam: estimateWam(grades),
      unitsRemaining: slots,
      semestersLeft: terms.length,
      graduation: last ? termLabel(last.term) : null,
      finishEarly: finishEarly ? termLabel(finishEarly) : null,
      year: Math.min(3, Math.floor(passedCp / 100) + 1),
    },
  };
}

// A short chain through code: back to a passed unit, then forward to the furthest planned unit.
export function prerequisitePath(code, view, profile, max = 5) {
  const { edges, semesters } = view;
  const placed = (c) => semesters.findIndex((s) => s.includes(c));
  const known = (c) =>
    profile.units[c]?.status === 'passed' || profile.units[c]?.status === 'enrolled' || placed(c) >= 0;
  const back = [];
  let cur = code;
  while (back.length < max - 1) {
    const { and, or } = prereqsOf(cur, edges);
    const options = [...and, ...or].filter(known);
    if (!options.length) break;
    // Prefer what the student already has, then what comes earliest in the plan.
    options.sort(
      (a, b) =>
        (profile.units[b]?.status === 'passed') - (profile.units[a]?.status === 'passed') || placed(a) - placed(b)
    );
    cur = options[0];
    if (back.includes(cur) || cur === code) break;
    back.unshift(cur);
  }
  const forward = [];
  cur = code;
  const later = new Set(semesters.flat());
  while (back.length + 1 + forward.length < max) {
    const next = edges.filter((e) => e.source === cur && later.has(e.target)).map((e) => e.target);
    if (!next.length) break;
    next.sort(
      (a, b) => dependentsOf(b, edges, later).size - dependentsOf(a, edges, later).size || placed(a) - placed(b)
    );
    cur = next[0];
    if (forward.includes(cur)) break;
    forward.push(cur);
  }
  return [...back, code, ...forward];
}
