// Mock backend for UI work (VITE_USE_MOCK=true). Units and prerequisites mirror doc/Dataset and the
// seeded catalog; the planner is a port of service/recommender.py. Answers are sample text.
// URL switches: ?mock=down (503 on every call), ?mock=cycle (409 on /recommend).
import { ApiError } from './errors.js';
import { CS_CORE_CODES, CS_MAJORS, ELECTIVE_UNIT_CODES, MAJOR_UNIT_CODES, normalizeMajorId } from '../data/csMajors.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const flag = () => new URLSearchParams(window.location.search).get('mock');
async function gate(ms) {
  await delay(ms);
  if (flag() === 'down') throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'The service is not responding.');
}

export const CATALOG = {
  COS10004: 'Computer Systems',
  COS10009: 'Introduction to Programming',
  COS10022: 'Data Science Principles',
  COS10026: 'Computing Technology Inquiry Project',
  COS20007: 'Object Oriented Programming',
  COS20011: 'Web Application Development',
  COS20019: 'Cloud Computing Architecture',
  COS20031: 'Database Design Project',
  COS30008: 'Data Structures and Patterns',
  COS30018: 'Intelligent Systems',
  COS30019: 'Introduction to Artificial Intelligence',
  COS30082: 'Applied Machine Learning',
  COS40003: 'Concurrent Programming',
  COS40005: 'Computing Technology Project A',
  COS40007: 'Artificial Intelligence Engineering',
  MTH10013: 'Linear Algebra and Applications',
  STA10003: 'Foundations of Statistics',
  SWE20004: 'Technical Software Development',
  SWE30003: 'Software Architectures and Design',
  TNE10003: 'Introduction to Network Administration',
  TNE10006: 'Networks and Switching',
  TNE30009: 'Network Security and Resilience',
};

// doc/Dataset/Course_Prerequisites.csv as [prerequisite, dependent, rule]
export const EDGES = [
  ['TNE10006', 'TNE30009', 'OR'],
  ['COS20007', 'COS40003', 'OR'],
  ['SWE20004', 'COS40003', 'OR'],
  ['COS30008', 'COS40003', 'OR'],
  ['COS20007', 'SWE30003', 'AND'],
  ['COS10009', 'COS40007', 'AND'],
  ['COS30019', 'COS30082', 'OR'],
  ['COS30018', 'COS30082', 'OR'],
  ['COS20007', 'COS30019', 'OR'],
  ['COS30008', 'COS30019', 'OR'],
  ['COS20007', 'COS30018', 'OR'],
  ['SWE20004', 'COS30018', 'OR'],
  ['COS20011', 'COS30018', 'OR'],
  ['COS20007', 'COS40005', 'ASSUMED'],
  ['COS20031', 'COS40005', 'ASSUMED'],
  ['COS10009', 'COS10004', 'ASSUMED'],
  ['COS10009', 'COS20007', 'AND'],
  ['COS10009', 'COS20031', 'AND'],
  ['COS10026', 'COS20031', 'AND'],
].map(([source, target, rule_type]) => ({ source, target, rule_type }));

// doc/Dataset/Taxonomy_Mapping.json, as used by load_curriculum()
const MAPPED = {
  'artificial-intelligence': ['COS30019', 'COS30018', 'COS40007', 'COS30082', 'COS10009', 'COS20007', 'SWE20004'],
  'data-science': ['COS10022', 'COS10009', 'COS20007', 'SWE20004'],
  'software-development': ['SWE30003', 'COS40003', 'COS20019', 'COS10009', 'COS20007', 'SWE20004'],
  'internet-of-things': ['TNE10006', 'TNE10003', 'TNE30009', 'COS20019', 'COS10009', 'COS20007', 'SWE20004'],
  'cyber-security': ['TNE10006', 'TNE10003', 'TNE30009', 'COS10009', 'COS20007', 'SWE20004'],
};

<<<<<<< Updated upstream
const UNIT_DESCRIPTIONS = {
  COS10004: 'Covers digital logic, computer architecture, assembly programming, and hardware-software interaction.',
  COS10009: 'Introduces procedural and structured programming fundamentals, control flow, and problem solving.',
  COS10025: 'Explores ethical technology design and engineering projects within Indigenous Australian contexts.',
  COS10026: 'Builds foundational full-stack web development skills using HTML, CSS, JavaScript, and PHP.',
  COS20007: 'Focuses on object-oriented design principles, inheritance, polymorphism, and software testing.',
  COS20019: 'Explores cloud computing architectures, virtualization, containers, and distributed deployment.',
  COS30008: 'Covers algorithms, data structures, complexity analysis, and efficient problem solving.',
  COS30018: 'Applies heuristic search, planning, and intelligent agent techniques to complex problems.',
  COS30019: 'Introduces foundational artificial intelligence concepts, search, knowledge representation, and reasoning.',
  COS30049: 'Delivers a team-based computing innovation project using agile development and prototyping.',
  COS30082: 'Covers supervised and unsupervised machine learning, neural networks, and model evaluation.',
  TNE10006: 'Introduces TCP/IP networking, routing, switching, and network protocol fundamentals.',
  TNE30009: 'Covers network security, cryptography, firewalls, and intrusion detection systems.',
};

const unit = (code) => ({
  code,
  name: CATALOG[code] ?? `Unit ${code}`,
  credit_points: 12.5,
  description: UNIT_DESCRIPTIONS[code] ?? `${CATALOG[code] ?? `Unit ${code}`} (12.5 credit points).`,
});
=======
const unit = (code) => ({ code, name: CATALOG[code] ?? `Unit ${code}`, credit_points: 12.5 });
>>>>>>> Stashed changes

const majorOf = (id) => {
  const m = CS_MAJORS.find((x) => x.id === normalizeMajorId(id));
  if (!m) throw new ApiError(404, 'UNKNOWN_MAJOR', `Unknown major "${id}".`);
  return m;
};

const ancestors = (code, seen = new Set()) => {
  for (const e of EDGES) if (e.target === code && !seen.has(e.source)) ancestors(e.source, seen.add(e.source));
  return seen;
};

export function curriculumFor(majorId) {
  const set = new Set(
    [...CS_CORE_CODES, ...(MAJOR_UNIT_CODES[majorId] ?? []), ...(MAPPED[majorId] ?? []), ...ELECTIVE_UNIT_CODES].filter(
      (c) => CATALOG[c]
    )
  );
  for (const c of [...set]) ancestors(c).forEach((a) => CATALOG[a] && set.add(a));
  return set;
}

export async function getMajors() {
  await gate(200);
  return { majors: CS_MAJORS };
}

// The backend returns every seeded unit whatever the major.
export async function getUnits() {
  await gate(250);
  return { units: Object.keys(CATALOG).sort().map(unit) };
}

const isRule = (e, rule) => (e.rule_type || 'AND').toUpperCase() === rule;

function eligible(code, scheduled) {
  const pre = EDGES.filter((e) => e.target === code);
  const and = pre.filter((e) => isRule(e, 'AND')).every((e) => scheduled.has(e.source));
  const or = pre.filter((e) => isRule(e, 'OR'));
  return and && (!or.length || or.some((e) => scheduled.has(e.source)));
}

function descendants(code, within) {
  const seen = new Set();
  const stack = [code];
  while (stack.length) {
    const c = stack.pop();
    for (const e of EDGES) {
      if (e.source !== c || !within.has(e.target) || seen.has(e.target)) continue;
      seen.add(e.target);
      stack.push(e.target);
    }
  }
  return seen.size;
}

/** POST /api/recommend. Same rules as generate_study_plan(): retakes first, then most unlocks, then code. */
export async function recommend({
  major,
  completed_units,
  failed_units = [],
  enrolled_units = [],
  units_per_semester = 3,
}) {
  await gate(700);
  const m = majorOf(major);
  if (flag() === 'cycle') {
    throw new ApiError(409, 'CURRICULUM_CYCLE', 'A circular prerequisite was found in the curriculum data.', {
      cycle: ['COS30018', 'COS30019', 'COS30018'],
    });
  }
  const unknown = completed_units.filter((c) => !CATALOG[c]);
  if (unknown.length) throw new ApiError(422, 'UNKNOWN_UNIT', `Unknown completed course codes: ${unknown.join(', ')}`);

  const passed = new Set(completed_units);
  const failed = new Set(failed_units.filter((c) => CATALOG[c] && !passed.has(c)));
  const enrolled = new Set(enrolled_units.filter((c) => CATALOG[c] && !passed.has(c)));
  const scheduled = new Set([...passed, ...enrolled]);
  const curriculum = curriculumFor(m.id);
  const remaining = new Set([...curriculum, ...failed].filter((c) => !scheduled.has(c)));

  const semesters = [];
  while (remaining.size) {
    const candidates = [...remaining].filter((c) => eligible(c, scheduled));
    if (!candidates.length) break;
    const score = Object.fromEntries(candidates.map((c) => [c, descendants(c, remaining)]));
    candidates.sort((a, b) => failed.has(b) - failed.has(a) || score[b] - score[a] || a.localeCompare(b));
    const picked = candidates.slice(0, Math.max(1, units_per_semester));
    semesters.push({
      index: semesters.length + 1,
      name: `Semester ${semesters.length + 1}`,
      credit_points: picked.length * 12.5,
      units: picked.map((c, i) => ({
        ...unit(c),
        rank: i + 1,
        is_retake: failed.has(c),
        status: failed.has(c) ? 'Retake Required' : 'Planned',
        reason: score[c] ? `has ${score[c]} remaining downstream units` : 'no remaining downstream dependencies',
      })),
    });
    picked.forEach((c) => {
      scheduled.add(c);
      remaining.delete(c);
    });
  }

  const blocked_units = [...remaining].sort().map((c) => ({ ...unit(c), missing_prereqs: [], available_after: null }));
  const nodes = [...new Set([...curriculum, ...passed, ...failed, ...enrolled])].sort();
  const status = (c) =>
    passed.has(c)
      ? 'passed'
      : enrolled.has(c)
        ? 'enrolled'
        : failed.has(c)
          ? 'retake'
          : remaining.has(c)
            ? 'blocked'
            : 'planned';
  return {
    major: m,
    semesters,
    blocked_units,
    violations: 0,
    completed_units: [...passed],
    failed_units: [...failed],
    enrolled_units: [...enrolled],
    dag_graph: {
      nodes: nodes.map((c) => ({ id: c, label: `${c}: ${CATALOG[c]}`, status: status(c) })),
      edges: EDGES.filter((e) => nodes.includes(e.source) && nodes.includes(e.target)),
    },
  };
}

/** POST /api/plans (not in the backend yet). Returns a short code with no name or student ID. */
export async function sharePlan() {
  await gate(500);
  const pick = () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)];
  return { code: `${pick()}${pick()}-${pick()}${pick()}` };
}

// A student for demos: AI major, eight units passed, one to retake.
export const SAMPLE_PROFILE = {
  major: 'artificial-intelligence',
  units: {
    COS10009: { status: 'passed', grade: 'HD' },
    COS10004: { status: 'passed', grade: 'D' },
    COS10026: { status: 'passed', grade: 'C' },
    TNE10006: { status: 'passed', grade: 'C' },
    COS10022: { status: 'passed', grade: 'D' },
    MTH10013: { status: 'passed', grade: 'C' },
    COS20019: { status: 'passed', grade: 'D' },
    COS20011: { status: 'passed', grade: 'C' },
    COS20007: { status: 'failed' },
  },
};

const OUTLINE = (code, date, page, section, quote, extra = {}) => ({
  doc: `${code} Unit Outline`,
  outline_date: date,
  page,
  section,
  quote,
  url: `https://example.edu/unit-outlines/${code}.pdf#page=${page}`, // placeholder link
  ...extra,
});

const REQ_QUOTE = 'Pre-requisites: COS20007 Object Oriented Programming OR COS30008 Data Structures and Patterns';
const REQUISITES = OUTLINE('COS30019', 'Jan 2026', 2, 'Requisites', REQ_QUOTE);
// The same page with its requisites table, for answers that show outline excerpts.
const REQUISITES_PAGE = OUTLINE('COS30019', 'Jan 2026', 2, 'Requisites', REQ_QUOTE, {
  table: {
    head: ['Requisite', 'Units'],
    rows: [
      ['Pre-requisites', 'COS20007 or COS30008'],
      ['Co-requisites', 'Nil'],
      ['Assumed knowledge', 'Intermediate OOP'],
    ],
    highlight: [0],
  },
});
const ASSESSMENT = OUTLINE(
  'COS30019',
  'Jan 2026',
  6,
  'Assessment overview',
  'Assignment 1 (Individual) 20%. Assignment 2 (Group) 50%. Final Assessment Questionnaire (Individual) 30%.',
  {
    table: {
      head: ['Task', 'Who', 'Weight'],
      rows: [
        ['Assignment 1 (research report)', 'Individual', '20%'],
        ['Assignment 2 (project)', 'Group', '50%'],
        ['Final questionnaire', 'Individual', '30%'],
      ],
      highlight: [0, 1, 2],
    },
  }
);
const HURDLES = OUTLINE(
  'COS30019',
  'Jan 2026',
  7,
  'Hurdle requirements',
  'There are no hurdle requirements in this unit.'
);
const GEN_AI = OUTLINE(
  'COS30019',
  'Jan 2026',
  6,
  'Use of generative AI',
  'The final assessment questionnaire must be completed without the use of generative AI tools.'
);
const YOUR_PLAN = { doc: 'Your plan', section: 'January 2027 · standard load, 3 units', kind: 'plan' };
const AI_STRUCTURE = {
  doc: 'AI major structure',
  section: 'Course structure 2027',
  quote: 'Major units: COS20019, COS20031, COS30018, COS30019, COS30082, SWE30003, COS40007.',
};

const CAN_I_TAKE = `Not yet. COS30019 needs COS20007 Object Oriented Programming or COS30008 Data Structures and Patterns [1]. You're retaking COS20007 in January 2027, so the earliest you can take COS30019 is May 2027 [2].

\`\`\`mermaid
flowchart LR
  COS10009["COS10009: Introduction to Programming"] --> COS20007["COS20007: Object Oriented Programming"]
  COS20007 --> COS30019["COS30019: Introduction to Artificial Intelligence"]
  COS30019 --> COS30082["COS30082: Applied Machine Learning"]
\`\`\`

<<<<<<< Updated upstream
A standard load is 3 units, so two more fit alongside COS20007 [2]. These also fit next semester:
=======
A standard load is 3 units, so two more fit alongside COS20007 [2]. These are next in your plan:
>>>>>>> Stashed changes

| Unit | Type | Why it fits |
| --- | --- | --- |
| COS20031 Database Design Project | Major | Required for the AI major [3] |
| SWE20004 Technical Software Development | Elective | Its prerequisites are met, so you can take it now [2] |`;

const HOW_TO_PASS = `## Passing COS30019 Introduction to Artificial Intelligence

Your grade comes from three tasks: a research report, a group project and a final questionnaire [2]. The outline lists no hurdle requirements, so no single task has to be passed on its own [3].

### How your mark is made up

| Task | Who | Weight | Due |
| --- | --- | --- | --- |
| Assignment 1: research report | Individual | 20% | End of week 6 |
| Assignment 2: AI project in three parts | Group | 50% | Weeks 6, 11 and 12 |
| Final assessment questionnaire | Individual, open book | 30% | Final assessment period |

### Steps to pass

1. **Get eligible first.** COS30019 needs COS20007 or COS30008 [1]. You're retaking COS20007 in January 2027, so plan COS30019 for May 2027.
2. **Start the research report early.** Assignment 1 is individual, worth 20% and due at the end of week 6 [2].
3. **Plan the group project as three deadlines.** Part A is due in week 6, Part B in week 11 and Part C in week 12. Together they are worth 50% [2].
4. **Prepare for the final questionnaire on your own.** It is online and open book, worth 30%, and must be done without AI help [2] [4].

### Where COS30019 sits in your degree

\`\`\`mermaid
flowchart LR
  COS10009["COS10009: Introduction to Programming"] --> COS20007["COS20007: Object Oriented Programming"]
  COS20007 --> COS30019["COS30019: Introduction to Artificial Intelligence"]
  COS20007 -.-> COS30008["COS30008: Data Structures and Patterns"]
  COS30008 -.-> COS30019
  COS30019 --> COS30082["COS30082: Applied Machine Learning"]
\`\`\``;

const COMPARE = `Both majors share the core units and COS10009 Introduction to Programming [1]. They differ in where they go next:

| | Artificial Intelligence | Data Science |
| --- | --- | --- |
| Focus | Building systems that search, reason and learn | Working with data to answer questions |
| Major units | COS30019, COS30018, COS30082, COS40007 | COS10022, COS30082 |
| Shared unit | COS30082 Applied Machine Learning | COS30082 Applied Machine Learning |

COS30082 counts toward both, so you can try it before you commit [1].`;

const NEXT_AI = `With COS20007 still to retake, the AI units open to you next semester are COS40007 Artificial Intelligence Engineering, which only needs COS10009 [2], and COS30018 Intelligent Systems, whose prerequisite COS20011 you have passed [1]. COS30019 has to wait until May 2027 [1].`;

const FAIL_AGAIN = `If you fail COS20007 again, COS30019, COS30008 and SWE30003 move back one more term, because each needs it [1]. Your graduation would move from your current date by at least one term [2]. Talk to an advisor early if you're worried about the retake.`;

const KB = [
  {
    test: (q) => /\b(the )?ai unit\b/.test(q) && !/cos\d{5}/.test(q),
    reply: {
      needs_clarification: true,
      answer: 'Which unit do you mean? Three units in your course have AI in the name.',
      options: [
        { code: 'COS30019', name: CATALOG.COS30019, note: 'Major unit' },
        { code: 'COS30018', name: CATALOG.COS30018, note: 'Major unit' },
        { code: 'COS40007', name: CATALOG.COS40007, note: 'Major unit' },
      ],
      citations: [],
      steps: [{ label: 'Found 3 units with AI in the name' }],
    },
  },
  {
    test: (q) => q.includes('cos30019') && /(pass|assess|mark|grade)/.test(q),
    reply: {
      answer: HOW_TO_PASS,
      citations: [REQUISITES_PAGE, ASSESSMENT, HURDLES, GEN_AI],
      steps: [
        { label: 'Matched the unit', detail: 'Matched your question to COS30019' },
        { label: 'Searched 1 unit outline', detail: 'Searched the COS30019 unit outline and read pages 2, 6 and 7' },
        { label: 'Checked your plan', detail: 'Checked your plan: COS20007 is a retake in January 2027' },
      ],
    },
  },
  {
    test: (q) => q.includes('cos30019') && /(take|next|enrol|when)/.test(q),
    reply: {
      answer: CAN_I_TAKE,
      citations: [REQUISITES, YOUR_PLAN, AI_STRUCTURE],
      steps: [
        { label: 'Read your plan' },
        { label: 'Searched 3 unit outlines' },
        { label: 'Checked 2 prerequisite rules' },
      ],
    },
  },
  {
    test: (q) => q.includes('compare'),
    reply: { answer: COMPARE, citations: [AI_STRUCTURE], steps: [{ label: 'Read 2 course structures' }] },
  },
  {
    test: (q) => /which .*units/.test(q) || q.includes('next semester'),
    reply: {
      answer: NEXT_AI,
      citations: [
        OUTLINE('COS30018', 'May 2026', 2, 'Requisites', 'Pre-requisites: COS20007 OR SWE20004 OR COS20011'),
        OUTLINE('COS40007', 'Sep 2026', 2, 'Requisites', 'Pre-requisites: COS10009 Introduction to Programming'),
      ],
      steps: [{ label: 'Read your plan' }, { label: 'Searched 3 unit outlines' }],
    },
  },
  {
    test: (q) => q.includes('fail') && q.includes('cos20007'),
    reply: {
      answer: FAIL_AGAIN,
      citations: [REQUISITES, YOUR_PLAN],
      steps: [{ label: 'Read your plan' }, { label: 'Checked 3 prerequisite rules' }],
    },
  },
];

/** POST /api/chat */
export async function chat({ question, history = [], scope = [] }) {
  await gate(1200);
  // A short follow-up ("Yes, COS30019 ...") is read together with the question before it.
  const prev = history.filter((h) => h.role === 'user').pop()?.content ?? '';
  const q = `${question} ${/^(yes|no|i mean)\b/i.test(question.trim()) ? prev : ''}`.toLowerCase().trim();
  if (!q) throw new ApiError(422, 'VALIDATION_ERROR', 'Question must not be empty.');
  const base = { threshold: 1.2, sources_checked: 5, latency_ms: 2100 + Math.round(Math.random() * 400) };
  if (/(credit|transfer|another university|other university)/.test(q)) {
    return { ...base, answer: null, citations: [], abstained: true, abstain_reason: 'OUT_OF_SCOPE', sources_passed: 0 };
  }
  const code = q.match(/[a-z]{3}\d{4,5}/)?.[0]?.toUpperCase();
  if (code && !CATALOG[code]) {
    return {
      ...base,
      answer: null,
      citations: [],
      abstained: true,
      abstain_reason: 'UNIT_NOT_FOUND',
      unit: code,
      sources_checked: 0,
      sources_passed: 0,
    };
  }
  const hit = KB.find((k) => k.test(q));
  if (!hit) {
    return {
      ...base,
      answer: null,
      citations: [
        OUTLINE(
          'COS20007',
          'May 2025',
          5,
          'Assessment',
          'Assessment: portfolio of tasks across the semester and a final test.'
        ),
      ],
      abstained: true,
      abstain_reason: 'LOW_SIMILARITY',
      sources_passed: 0,
    };
  }
  const reply = { ...hit.reply };
  if (!scope.includes('plan')) reply.steps = reply.steps?.filter((s) => !/plan/i.test(s.label));
  return { ...base, abstained: false, abstain_reason: null, sources_passed: reply.citations.length, ...reply };
}
