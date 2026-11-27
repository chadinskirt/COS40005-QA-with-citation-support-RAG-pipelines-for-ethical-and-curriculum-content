// Teaching terms. The Vietnam campus runs three a year, starting in January, May and September.
export const TERM_MONTHS = [0, 4, 8];
const MONTH_NAMES = ['January', 'May', 'September'];
const SHORT_NAMES = ['Jan', 'May', 'Sep'];

// A term is { year, index } with index 0..2.
export function nextTerm(date = new Date()) {
  const index = TERM_MONTHS.findIndex((m) => m > date.getMonth());
  return index === -1 ? { year: date.getFullYear() + 1, index: 0 } : { year: date.getFullYear(), index };
}

export function addTerms(term, n) {
  const total = term.year * 3 + term.index + n;
  return { year: Math.floor(total / 3), index: total % 3 };
}

export const termLabel = (t) => `${MONTH_NAMES[t.index]} ${t.year}`;
export const termShort = (t) => `${SHORT_NAMES[t.index]} ${t.year}`;
export const termKey = (t) => `${t.year}-${t.index}`;

export function parseTermKey(key) {
  const m = /^(\d{4})-([0-2])$/.exec(key ?? '');
  return m ? { year: Number(m[1]), index: Number(m[2]) } : null;
}

// The next few terms a student can plan for.
export const upcomingTerms = (count = 4, date = new Date()) =>
  Array.from({ length: count }, (_, i) => addTerms(nextTerm(date), i));
