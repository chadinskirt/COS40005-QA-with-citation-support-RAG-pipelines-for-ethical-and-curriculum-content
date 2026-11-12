// Mock backend with the response shapes of docs/API_CONTRACT.md. All data is sample data.
// URL switches: ?mock=down (503 on every call), ?mock=cycle (409 on /recommend).
import { ApiError } from './errors.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const flag = () => new URLSearchParams(window.location.search).get('mock');
async function gate(ms = 500) {
  await delay(ms);
  if (flag() === 'down') throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'The answer service is not responding.');
}

const MAJORS = [
  { id: 'software-development', name: 'Software Development' },
  { id: 'artificial-intelligence', name: 'Artificial Intelligence' },
  { id: 'cybersecurity', name: 'Cybersecurity' },
  { id: 'data-science', name: 'Data Science' },
];

// code -> { name, credit_points, prereqs }
const UNITS = {
  COS10009: { name: 'Introduction to Programming', credit_points: 12.5, prereqs: [] },
  COS10004: { name: 'Computer Systems', credit_points: 12.5, prereqs: [] },
  MAT10004: { name: 'Discrete Mathematics', credit_points: 12.5, prereqs: [] },
  COS20015: { name: 'Fundamentals of Data Management', credit_points: 12.5, prereqs: [] },
  COS20007: { name: 'Object Oriented Programming', credit_points: 12.5, prereqs: ['COS10009'] },
  COS20019: { name: 'Cloud Computing Architecture', credit_points: 12.5, prereqs: ['COS10004'] },
  COS30008: { name: 'Data Structures and Patterns', credit_points: 12.5, prereqs: ['COS20007'] },
  COS30019: { name: 'Introduction to AI', credit_points: 12.5, prereqs: ['COS20007', 'MAT10004'] },
  COS30018: { name: 'Intelligent Systems', credit_points: 12.5, prereqs: ['COS30019'] },
  COS30082: { name: 'Applied Machine Learning', credit_points: 12.5, prereqs: ['COS30019'] },
  COS30049: { name: 'Computing Technology Innovation Project', credit_points: 12.5, prereqs: ['COS30019'] },
  COS30015: { name: 'IT Security', credit_points: 12.5, prereqs: ['COS10004'] },
  COS30043: { name: 'Interface Design and Development', credit_points: 12.5, prereqs: ['COS20007'] },
  STA20010: { name: 'Statistics for Data Science', credit_points: 12.5, prereqs: ['MAT10004'] },
};
const FOUNDATION = ['COS10009', 'COS10004', 'MAT10004', 'COS20015'];
const REQUIRED = {
  'artificial-intelligence': ['COS20007', 'COS20019', 'COS30008', 'COS30019', 'COS30018', 'COS30082', 'COS30049'],
  'software-development': ['COS20007', 'COS20019', 'COS30008', 'COS30043', 'COS30049'],
  cybersecurity: ['COS20007', 'COS20019', 'COS30015', 'COS30008', 'COS30049'],
  'data-science': ['COS20007', 'STA20010', 'COS30008', 'COS30019', 'COS30082'],
};
const unit = (code) => ({ code, name: UNITS[code].name, credit_points: UNITS[code].credit_points });
const majorOf = (id) => {
  const m = MAJORS.find((x) => x.id === id);
  if (!m) throw new ApiError(404, 'UNKNOWN_MAJOR', `Unknown major "${id}".`);
  return m;
};

export async function getMajors() {
  await gate(200);
  return { majors: MAJORS };
}

// Checklist units for the study profile, in Figma order.
const CHECKLIST = {
  'artificial-intelligence': [
    'COS10009',
    'COS10004',
    'COS20007',
    'MAT10004',
    'COS20015',
    'COS30008',
    'COS20019',
    'COS30019',
  ],
};
export async function getUnits(major) {
  await gate(250);
  majorOf(major);
  const codes = CHECKLIST[major] || [...FOUNDATION, ...REQUIRED[major].slice(0, 4)];
  return { units: codes.map(unit) };
}

// Up to 2 units per semester, 3 semesters. A unit needs every prerequisite done or placed in an
// earlier semester; the rest are blocked. Rank: more unlocked units first, ties by curriculum order.
export async function recommend(major, completedUnits) {
  await gate(900);
  const m = majorOf(major);
  if (flag() === 'cycle') {
    throw new ApiError(409, 'CURRICULUM_CYCLE', 'A circular prerequisite was found in the curriculum data.', {
      cycle: ['COS30018', 'COS30019', 'COS30018'],
    });
  }
  const unknown = completedUnits.filter((c) => !UNITS[c]);
  if (unknown.length)
    throw new ApiError(422, 'UNKNOWN_UNIT', `Unknown unit code(s): ${unknown.join(', ')}.`, { units: unknown });

  const done = new Set(completedUnits);
  const todo = [...FOUNDATION, ...REQUIRED[major]].filter((c) => !done.has(c));
  // Count of remaining units that depend on this one, directly or not.
  const unlocks = (code) => {
    const seen = new Set();
    const stack = [code];
    while (stack.length) {
      const c = stack.pop();
      for (const u of todo)
        if (!seen.has(u) && UNITS[u].prereqs.includes(c)) {
          seen.add(u);
          stack.push(u);
        }
    }
    return seen.size;
  };
  const byRank = (a, b) => unlocks(b) - unlocks(a) || todo.indexOf(a) - todo.indexOf(b);
  const reason = (c) => {
    const n = unlocks(c);
    return n ? `unlocks ${n} later unit${n > 1 ? 's' : ''}` : 'required for your major';
  };
  const placedIn = {};
  const semesters = [];
  for (let s = 1; s <= 3; s++) {
    const ready = todo.filter(
      (c) => !placedIn[c] && UNITS[c].prereqs.every((p) => done.has(p) || (placedIn[p] && placedIn[p] < s))
    );
    const pick = ready.sort(byRank).slice(0, 2);
    pick.forEach((c) => (placedIn[c] = s));
    if (pick.length)
      semesters.push({
        index: s,
        name: `Semester ${s}`,
        credit_points: pick.length * 12.5,
        units: pick.map((c, i) => ({ ...unit(c), rank: i + 1, reason: reason(c) })),
      });
  }
  const blocked_units = todo
    .filter((c) => !placedIn[c])
    .map((c) => {
      const missing = UNITS[c].prereqs.filter((p) => !done.has(p));
      // null unless every missing prerequisite is planned (same rule as the gateway).
      const allPlanned = missing.length > 0 && missing.every((p) => placedIn[p]);
      const last = allPlanned ? Math.max(...missing.map((p) => placedIn[p])) : 0;
      return { ...unit(c), missing_prereqs: missing, available_after: last ? `Semester ${last}` : null };
    });
  return { major: m, semesters, blocked_units, violations: 0, completed_units: [...done] };
}

const THRESHOLD = 0.7;
const DOC = (code) => `https://example.edu/unit-outlines/${code}.pdf`; // placeholder link
const KB = [
  {
    match: ['pass', 'prerequisite', 'cos30019'],
    answer:
      'You need an overall mark of at least 50% and must complete the hurdle task described in the unit outline [1]. The listed prerequisites are COS20007 Object Oriented Programming and MAT10004 Discrete Mathematics [2].',
    citations: [
      {
        id: 'c1',
        doc: 'COS30019 Unit Outline',
        section: '§4 Assessment',
        page: 6,
        snippet:
          '…to pass this unit students must achieve an overall mark of 50% or more and complete the hurdle task… (sample text)',
        similarity: 0.86,
        url: DOC('COS30019'),
      },
      {
        id: 'c2',
        doc: 'COS30019 Unit Outline',
        section: '§1 Unit details',
        page: 2,
        snippet: 'Pre-requisites: COS20007 Object Oriented Programming AND MAT10004 Discrete Mathematics (sample text)',
        similarity: 0.83,
        url: DOC('COS30019'),
      },
    ],
  },
  {
    match: ['pass', 'cos30019'],
    answer:
      'You need an overall mark of at least 50% and must complete the hurdle task described in the unit outline [1].',
    citations: [
      {
        id: 'c1',
        doc: 'COS30019 Unit Outline',
        section: '§4 Assessment',
        page: 6,
        snippet:
          '…to pass this unit students must achieve an overall mark of 50% or more and complete the hurdle task… (sample text)',
        similarity: 0.86,
        url: DOC('COS30019'),
      },
    ],
  },
  {
    match: ['prerequisite', 'cos30019'],
    answer:
      'The listed prerequisites for COS30019 Introduction to AI are COS20007 Object Oriented Programming and MAT10004 Discrete Mathematics [1].',
    citations: [
      {
        id: 'c2',
        doc: 'COS30019 Unit Outline',
        section: '§1 Unit details',
        page: 2,
        snippet: 'Pre-requisites: COS20007 Object Oriented Programming AND MAT10004 Discrete Mathematics (sample text)',
        similarity: 0.83,
        url: DOC('COS30019'),
      },
    ],
  },
  {
    match: ['cos20007', 'assess'],
    answer: 'COS20007 is assessed through a portfolio of tasks and a final test, as set out in the unit outline [1].',
    citations: [
      {
        id: 'c3',
        doc: 'COS20007 Unit Outline',
        section: '§4 Assessment',
        page: 5,
        snippet: 'Assessment: portfolio (60%), test (40%)… (sample text)',
        similarity: 0.8,
        url: DOC('COS20007'),
      },
    ],
  },
];

export async function chat(question) {
  await gate(1100);
  const q = question.toLowerCase();
  if (!q.trim()) throw new ApiError(422, 'VALIDATION_ERROR', 'Question must not be empty.');
  const base = { threshold: THRESHOLD, sources_checked: 5 };
  if (/(credit|transfer|another university|other university)/.test(q)) {
    return {
      ...base,
      answer: null,
      citations: [],
      abstained: true,
      abstain_reason: 'OUT_OF_SCOPE',
      top_similarity: 0.41,
      sources_passed: 0,
      latency_ms: 640,
    };
  }
  const hit =
    KB.find((k) => k.match.every((w) => q.includes(w))) ||
    KB.find((k) => k.match.some((w) => q.includes(w) && w.length > 6));
  if (!hit) {
    return {
      ...base,
      answer: null,
      citations: [],
      abstained: true,
      abstain_reason: 'LOW_SIMILARITY',
      top_similarity: 0.38,
      sources_passed: 0,
      latency_ms: 610,
    };
  }
  return {
    ...base,
    answer: hit.answer,
    citations: hit.citations,
    abstained: false,
    abstain_reason: null,
    top_similarity: Math.max(...hit.citations.map((c) => c.similarity)),
    sources_passed: hit.citations.length,
    latency_ms: 1180,
  };
}
