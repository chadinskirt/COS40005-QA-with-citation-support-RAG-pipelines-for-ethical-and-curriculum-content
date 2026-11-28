// One function per endpoint the UI calls (docs/API_CONTRACT.md).
// With VITE_USE_MOCK=true the calls go to ./mock.js, which is loaded on demand.
import { API_BASE, TIMEOUT_MS, USE_MOCK } from '../config.js';
import { mergeMajors, mergeUnitsForMajor } from '../data/csMajors.js';
import { ApiError } from './errors.js';

export { ApiError };

function toApiError(res, data) {
  if (data?.error) {
    const { code, message, details } = data.error;
    return new ApiError(res.status, code || `HTTP_${res.status}`, message || res.statusText, details);
  }
  // FastAPI's default validation body is { detail: [...] }.
  if (res.status === 422) return new ApiError(422, 'VALIDATION_ERROR', 'The request was rejected.', data?.detail);
  if ([502, 503, 504].includes(res.status)) {
    return new ApiError(res.status, 'SERVICE_UNAVAILABLE', 'The service is not responding.');
  }
  const message = typeof data?.detail === 'string' ? data.detail : res.statusText || 'Request failed.';
  return new ApiError(res.status, `HTTP_${res.status}`, message);
}

async function request(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw toApiError(res, data);
    if (data === null) throw new ApiError(res.status, 'BAD_RESPONSE', 'The server sent an unreadable response.');
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const message = e.name === 'AbortError' ? 'The request timed out.' : 'Could not reach the server.';
    throw new ApiError(0, 'NETWORK_ERROR', message);
  } finally {
    clearTimeout(timer);
  }
}

const mock = (fn, ...args) => import('./mock.js').then((m) => m[fn](...args));

const titleCase = (s) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// Accepts the v1.2 shape { doc, section, page, quote, url, outline_date }, the v1.1 shape
// { doc, section, page, snippet, similarity } and today's backend { source_file, text_snippet, similarity_score }.
export function normalizeCitation(c) {
  if (c.source_file) {
    const [, code, section] = /^(\S+)\s*(?:\((.+)\))?$/.exec(c.source_file.trim()) ?? [];
    return {
      doc: code && /^[A-Z]{3}\d{5}$/.test(code) ? `${code} Unit Outline` : c.source_file,
<<<<<<< Updated upstream
      section: c.section ?? (section ? titleCase(section) : null),
      page: c.page_number ?? c.page ?? null,
      date: c.outline_date ?? null,
      // Chunks start with "Unit CODE - Title (key):"; the passage is what follows.
      quote: (c.content ?? c.text_snippet ?? c.snippet ?? c.quote ?? '').replace(/^Unit [A-Z]{3}\d{5}[^\n]*:\n/, '').trim(),
      url: c.document_url ?? c.url ?? null,
      ...(c.document_url
        ? {
            document_url: c.document_url,
            source_file: c.source_file,
            unit_code: c.unit_code ?? (code && /^[A-Z]{3}\d{5}$/.test(code) ? code : null),
            similarity: c.similarity ?? c.similarity_score ?? null,
          }
        : {}),
=======
      section: section ? titleCase(section) : null,
      page: null,
      date: null,
      // Chunks start with "Unit CODE - Title (key):"; the passage is what follows.
      quote: (c.text_snippet ?? '').replace(/^Unit [A-Z]{3}\d{5}[^\n]*:\n/, '').trim(),
      url: null,
>>>>>>> Stashed changes
    };
  }
  return {
    doc: c.doc ?? 'Source',
    section: c.section ?? null,
    page: c.page ?? null,
    date: c.outline_date ?? null,
    quote: c.quote ?? c.snippet ?? null,
    url: c.url ?? null,
    kind: c.kind ?? 'outline',
    table: c.table ?? null,
  };
}

export function normalizeChat(r) {
  // The backend returns HTTP 200 with this text when Ollama is down; treat it as a service error.
  if (!r.abstained && typeof r.answer === 'string' && /^LLM connection failed/.test(r.answer)) {
    throw new ApiError(503, 'LLM_UNAVAILABLE', 'The answer model is not responding.');
  }
  return {
    ...r,
    answer: r.answer ?? null,
    citations: (r.citations ?? []).map(normalizeCitation),
    steps: r.steps ?? null,
    options: r.options ?? [],
  };
}

// What the backend needs to plan from a saved profile.
export function planBody(profile, load) {
  const by = (status) => Object.keys(profile.units).filter((c) => profile.units[c].status === status);
  return {
    major: profile.major,
    completed_units: by('passed'),
    failed_units: by('failed'),
    enrolled_units: by('enrolled'),
    units_per_semester: load,
  };
}

export const api = {
  /** GET /api/majors */
  getMajors: async () => {
    const data = USE_MOCK ? await mock('getMajors') : await request('GET', '/majors');
    return { ...data, majors: mergeMajors(data?.majors ?? []) };
  },
  /** GET /api/units?major={id} */
  getUnits: async (major) => {
    const data = USE_MOCK
      ? await mock('getUnits', major)
      : await request('GET', `/units?major=${encodeURIComponent(major)}`);
    return { ...data, units: mergeUnitsForMajor(major, data?.units ?? []) };
  },
  /** POST /api/recommend */
  recommend: (profile, load) => {
    const body = planBody(profile, load);
    return USE_MOCK ? mock('recommend', body) : request('POST', '/recommend', body);
  },
  /** POST /api/chat. scope: 'outlines' | 'plan' | 'grades'. plan is sent only when the student allows it. */
  chat: async (question, history = [], { scope = ['outlines'], plan = null } = {}) => {
    const body = { question, history, scope, ...(plan ? { plan } : {}) };
    return normalizeChat(USE_MOCK ? await mock('chat', body) : await request('POST', '/chat', body));
  },
  /** POST /api/plans. Returns { code }. Not in the backend yet (BACKEND_HANDOFF.md, item 6). */
  sharePlan: (plan) => (USE_MOCK ? mock('sharePlan', plan) : request('POST', '/plans', plan)),
};
