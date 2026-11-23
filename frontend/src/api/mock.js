// Mock backend with the response shapes of docs/API_CONTRACT.md. All data is sample data.
// URL switches: ?mock=down (503 on every call), ?mock=cycle (409 on /recommend).
import { ApiError } from './errors.js';
import {
  CS_CORE_CODES,
  CS_MAJORS,
  ELECTIVE_UNIT_CODES,
  MAJOR_UNIT_CODES,
  UNIT_CATALOG,
  getUnitCategory,
  normalizeMajorId,
} from '../data/csMajors.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const flag = () => new URLSearchParams(window.location.search).get('mock');
async function gate(ms = 500) {
  await delay(ms);
  if (flag() === 'down') throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'The answer service is not responding.');
}

const MAJORS = CS_MAJORS;
// Include legacy mock.test.js foundation units alongside real catalog units for mock.recommend compatibility.
const UNITS = {
  ...UNIT_CATALOG,
  COS10004: { name: 'Computer Systems', credit_points: 12.5, prereqs: [] },
  COS10025: { name: 'Technology in an Indigenous Context Project', credit_points: 12.5, prereqs: [] },
  COS10026: { name: 'Web Technology Project', credit_points: 12.5, prereqs: [] },
  MAT10004: { name: 'Discrete Mathematics', credit_points: 12.5, prereqs: [] },
  COS20015: { name: 'Fundamentals of Data Management', credit_points: 12.5, prereqs: [] },
  COS30049: { name: 'Computing Technology Innovation Project', credit_points: 12.5, prereqs: ['COS30019'] },
  COS30043: { name: 'Interface Design and Development', credit_points: 12.5, prereqs: ['COS20007'] },
  COS30015: { name: 'IT Security', credit_points: 12.5, prereqs: ['COS10004'] },
  COS40006: { name: 'Computing Technology Project B', credit_points: 12.5, prereqs: ['COS40005'] },
  LAW20019: { name: 'Law of Commerce', credit_points: 12.5, prereqs: [] },
  MDA10018: { name: 'Content Creator Lab', credit_points: 12.5, prereqs: [] },
  MTH10013: { name: 'Linear Algebra and Applications', credit_points: 12.5, prereqs: [] },
  STA10003: { name: 'Foundations of Statistics', credit_points: 12.5, prereqs: [] },
  STA20010: { name: 'Statistics for Data Science', credit_points: 12.5, prereqs: ['MAT10004'] },
};
const FOUNDATION = ['COS10009', 'COS10004', 'MAT10004', 'COS20015'];
const REQUIRED = {
  'artificial-intelligence': ['COS20007', 'COS20019', 'COS30008', 'COS30019', 'COS30018', 'COS30082', 'COS30049'],
  'data-science': ['COS20007', 'STA20010', 'COS30008', 'COS30019', 'COS30082'],
  'software-development': ['COS20007', 'COS20019', 'COS30008', 'COS30043', 'COS30049'],
  'internet-of-things': ['COS20007', 'TNE10006', 'COS20019', 'SWE30011', 'TNE30009'],
  'cyber-security': ['COS20007', 'COS20019', 'COS30015', 'COS30008', 'COS30049'],
};

const unit = (code, majorId) => ({
  code,
  name: UNITS[code].name,
  credit_points: UNITS[code].credit_points,
  ...(majorId ? { category: getUnitCategory(code, majorId) } : {}),
});

const majorOf = (id) => {
  const norm = normalizeMajorId(id);
  const m = MAJORS.find((x) => x.id === norm);
  if (!m) throw new ApiError(404, 'UNKNOWN_MAJOR', `Unknown major "${id}".`);
  return m;
};

export async function getMajors() {
  await gate(200);
  return { majors: MAJORS };
}

export async function getUnits(major) {
  await gate(250);
  const m = majorOf(major);
  const codes = [...new Set([...CS_CORE_CODES, ...(MAJOR_UNIT_CODES[m.id] ?? []), ...ELECTIVE_UNIT_CODES])];
  return { units: codes.map((c) => unit(c, m.id)) };
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
  const todo = [...new Set([...FOUNDATION, ...REQUIRED[m.id]])].filter((c) => !done.has(c));
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

export async function chat(question, studentId = null) {
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
  if (studentId && /(plan|roadmap|retake|pathway|diagram)/.test(q)) {
    const s = MOCK_STUDENTS[String(studentId)];
    const answer = [
      `Here is a summary for **Student #${studentId}** (${s ? s.major_code : 'custom'}):`,
      '',
      '| Unit | Status | Next Action |',
      '| --- | --- | --- |',
      '| COS20007 | Retake Required | Priority in Semester 1 |',
      '| COS30019 | Blocked | Unlocks after COS20007 |',
      '',
      '```mermaid',
      'flowchart LR',
      '  COS20007[COS20007 Retake] --> COS30019[COS30019 Intro to AI]',
      '  MAT10004[MAT10004 Passed] --> COS30019',
      '```',
    ].join('\n');
    return {
      ...base,
      answer,
      citations: KB[0].citations,
      abstained: false,
      abstain_reason: null,
      top_similarity: 0.86,
      sources_passed: 2,
      latency_ms: 920,
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

const MOCK_STUDENTS = {
  100001: {
    student_id: 100001,
    major_code: 'artificial-intelligence',
    target_career: 'Machine Learning Engineer',
    study_goal: 'Graduate on time with AI specialization',
    passed_units: ['COS10009', 'COS10004', 'MAT10004'],
    failed_units: ['COS20007'],
    enrolled_units: ['COS20015'],
  },
};

export async function getStudent(studentId) {
  await gate(250);
  const record = MOCK_STUDENTS[String(studentId)];
  if (!record) throw new ApiError(404, 'STUDENT_NOT_FOUND', `Student ${studentId} not found.`);
  return { ...record };
}

export async function saveStudent(studentId, payload) {
  await gate(300);
  const id = Number(studentId);
  const record = {
    student_id: id,
    major_code: payload.major_code,
    target_career: payload.target_career ?? '',
    study_goal: payload.study_goal ?? '',
    passed_units: [...(payload.passed_units ?? [])],
    failed_units: [...(payload.failed_units ?? [])],
    enrolled_units: [...(payload.enrolled_units ?? [])],
  };
  MOCK_STUDENTS[String(id)] = record;
  return { ...record };
}

export async function planStudent(studentId, payload = {}) {
  await gate(700);
  const record = MOCK_STUDENTS[String(studentId)];
  const majorCode = payload.major_override || record?.major_code || 'artificial-intelligence';
  const m = majorOf(majorCode);
  const unitsPerSem = payload.units_per_semester || 4;
  const passed = new Set(record?.passed_units ?? []);
  const failed = new Set(record?.failed_units ?? []);
  const enrolled = new Set(record?.enrolled_units ?? []);
  const done = new Set([...passed, ...enrolled]);
  const allCodes = [...new Set([...FOUNDATION, ...(REQUIRED[m.id] ?? [])])];
  const todo = allCodes.filter((c) => !done.has(c));

  const placedIn = {};
  const semesters = [];
  for (let s = 1; s <= 3; s++) {
    const ready = todo.filter(
      (c) => !placedIn[c] && UNITS[c].prereqs.every((p) => done.has(p) || (placedIn[p] && placedIn[p] < s))
    );
    ready.sort((a, b) => (failed.has(b) ? 1 : 0) - (failed.has(a) ? 1 : 0));
    const pick = ready.slice(0, unitsPerSem);
    pick.forEach((c) => (placedIn[c] = s));
    if (pick.length) {
      semesters.push({
        index: s,
        name: `Semester ${s}`,
        credit_points: pick.length * 12.5,
        units: pick.map((c, i) => ({
          ...unit(c),
          rank: i + 1,
          is_retake: failed.has(c),
          reason: failed.has(c) ? 'Retake required before dependent units' : 'Required for your major',
        })),
      });
    }
  }
  const blocked_units = todo
    .filter((c) => !placedIn[c])
    .map((c) => {
      const missing = UNITS[c].prereqs.filter((p) => !done.has(p));
      const allPlanned = missing.length > 0 && missing.every((p) => placedIn[p]);
      const last = allPlanned ? Math.max(...missing.map((p) => placedIn[p])) : 0;
      return { ...unit(c), missing_prereqs: missing, available_after: last ? `Semester ${last}` : null };
    });

  const blockedSet = new Set(blocked_units.map((u) => u.code));
  const nodes = allCodes.map((code) => {
    let status = 'planned';
    if (passed.has(code)) status = 'passed';
    else if (enrolled.has(code)) status = 'enrolled';
    else if (failed.has(code)) status = 'retake';
    else if (blockedSet.has(code)) status = 'blocked';
    return { id: code, label: `${code} · ${UNITS[code].name}`, status };
  });
  const edges = [];
  for (const code of allCodes) {
    for (const p of UNITS[code].prereqs) {
      if (allCodes.includes(p)) edges.push({ source: p, target: code, rule_type: 'prereq' });
    }
  }

  return {
    major: m,
    semesters,
    blocked_units,
    violations: 0,
    completed_units: [...passed],
    failed_units: [...failed],
    enrolled_units: [...enrolled],
    dag_graph: { nodes, edges },
  };
}
