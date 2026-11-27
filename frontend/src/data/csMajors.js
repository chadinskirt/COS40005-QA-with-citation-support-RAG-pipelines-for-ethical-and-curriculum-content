export const CS_MAJORS = [
  { id: 'artificial-intelligence', name: 'Artificial Intelligence' },
  { id: 'data-science', name: 'Data Science' },
  { id: 'software-development', name: 'Software Development' },
  { id: 'internet-of-things', name: 'Internet of Things' },
  { id: 'cyber-security', name: 'Cybersecurity' },
];

// Strictly aligned with seeded PostgreSQL courses, doc/JSON/, and doc/Dataset/.
export const UNIT_CATALOG = {
  COS10009: { name: 'Introduction to Programming', credit_points: 12.5, prereqs: [] },
  COS10022: { name: 'Data Science Principles', credit_points: 12.5, prereqs: [] },
  COS20007: { name: 'Object Oriented Programming', credit_points: 12.5, prereqs: ['COS10009'] },
  COS20011: { name: 'Web Application Development', credit_points: 12.5, prereqs: ['COS10009'] },
  COS20019: { name: 'Cloud Computing Architecture', credit_points: 12.5, prereqs: ['COS10009'] },
  COS20031: { name: 'Database Design Project', credit_points: 12.5, prereqs: ['COS10009'] },
  COS30008: { name: 'Data Structures and Patterns', credit_points: 12.5, prereqs: ['COS20007'] },
  COS30018: { name: 'Intelligent Systems', credit_points: 12.5, prereqs: ['COS20007'] },
  COS30019: { name: 'Introduction to Artificial Intelligence', credit_points: 12.5, prereqs: ['COS20007'] },
  COS30082: { name: 'Applied Machine Learning', credit_points: 12.5, prereqs: ['COS30019'] },
  COS40003: { name: 'Concurrent Data Structures', credit_points: 12.5, prereqs: ['COS30008'] },
  COS40005: { name: 'Computing Technology Project A', credit_points: 12.5, prereqs: ['COS20007'] },
  COS40007: { name: 'Artificial Intelligence Engineering', credit_points: 12.5, prereqs: ['COS10009'] },
  SWE30003: { name: 'Software Architectures and Design', credit_points: 12.5, prereqs: ['COS20007'] },
  TNE10003: { name: 'Introduction to Network Administration', credit_points: 12.5, prereqs: [] },
  TNE10006: { name: 'Networks and Switching', credit_points: 12.5, prereqs: [] },
  TNE30009: { name: 'Network Security and Resilience', credit_points: 12.5, prereqs: ['TNE10006'] },
};

export const CS_CORE_CODES = [
  'COS10004',
  'COS10009',
  'COS10025',
  'COS10026',
  'TNE10006',
  'COS20007',
  'COS40005',
  'COS40006',
];

export const CORE_UNIT_CODES = CS_CORE_CODES;

export const MAJOR_UNIT_CODES = {
  'artificial-intelligence': [
    'COS20019',
    'COS20031',
    'COS30018',
    'COS30019',
    'COS30049',
    'COS30082',
    'SWE30003',
    'COS40007',
  ],
  'data-science': ['COS10022', 'COS30082'],
  'software-development': ['COS20019', 'SWE30003'],
  'internet-of-things': ['TNE10006', 'TNE30009', 'COS20019'],
  'cyber-security': ['TNE10006', 'TNE10003', 'TNE30009'],
};

export const ELECTIVE_UNIT_CODES = [
  'LAW20019',
  'COS40003',
  'MDA10018',
  'STA10003',
  'COS10022',
  'MTH10013',
];

const MAJOR_ALIASES = {
  cybersecurity: 'cyber-security',
  ai: 'artificial-intelligence',
  sec: 'cyber-security',
  'hs-csvietai': 'artificial-intelligence',
  'mj-aiv': 'artificial-intelligence',
};

export function normalizeMajorId(majorId) {
  return MAJOR_ALIASES[majorId] || MAJOR_ALIASES[majorId?.toLowerCase?.()] || majorId;
}

const CORE_SET = new Set(CS_CORE_CODES);

/**
 * Merges API majors with the 5 canonical Computer Science majors,
 * stripping raw backend taxonomy IDs (e.g. CS_AI, CS_CLOUD).
 */
export function mergeMajors(apiMajors = []) {
  const result = [];
  const seenIds = new Set();
  const seenNames = new Set();

  for (const m of apiMajors) {
    if (!m?.id || /^CS_/i.test(m.id) || seenIds.has(m.id)) continue;
    seenIds.add(m.id);
    if (m.name) seenNames.add(m.name.toLowerCase());
    result.push(m);
  }

  for (const m of CS_MAJORS) {
    if (seenIds.has(m.id) || seenNames.has(m.name.toLowerCase())) continue;
    seenIds.add(m.id);
    seenNames.add(m.name.toLowerCase());
    result.push(m);
  }

  return result;
}

/** Classifies a unit code as 'core', 'major', or 'elective' for the given major. */
export function getUnitCategory(code, majorId) {
  const norm = normalizeMajorId(majorId);
  const majorList = MAJOR_UNIT_CODES[norm] ?? [];
  if (CORE_SET.has(code)) return 'core';
  if (majorList.includes(code)) return 'major';
  return 'elective';
}

/**
 * Classifies and sorts live API units into Core, Major, and Elective without injecting unseeded codes.
 */
export function mergeUnitsForMajor(majorId, apiUnits = []) {
  const norm = normalizeMajorId(majorId);
  const majorList = MAJOR_UNIT_CODES[norm] ?? [];
  const seen = new Set();
  const result = [];

  for (const u of apiUnits) {
    if (!u?.code || seen.has(u.code)) continue;
    seen.add(u.code);
    result.push({
      ...u,
      credit_points: u.credit_points ?? UNIT_CATALOG[u.code]?.credit_points ?? 12.5,
      category: u.category ?? getUnitCategory(u.code, norm),
    });
  }

  const rankOf = (u) => {
    if (u.category === 'core') {
      const idx = CS_CORE_CODES.indexOf(u.code);
      return [0, idx === -1 ? Number.MAX_SAFE_INTEGER : idx];
    }
    if (u.category === 'major') {
      const idx = majorList.indexOf(u.code);
      return [1, idx === -1 ? Number.MAX_SAFE_INTEGER : idx];
    }
    const elecIdx = ELECTIVE_UNIT_CODES.indexOf(u.code);
    return [2, elecIdx === -1 ? Number.MAX_SAFE_INTEGER : elecIdx];
  };

  result.sort((a, b) => {
    const [catA, idxA] = rankOf(a);
    const [catB, idxB] = rankOf(b);
    if (catA !== catB) return catA - catB;
    if (idxA !== idxB) return idxA - idxB;
    return a.code.localeCompare(b.code);
  });

  return result;
}
