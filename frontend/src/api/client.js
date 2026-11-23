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
  return new ApiError(res.status, `HTTP_${res.status}`, res.statusText || 'Request failed.');
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

export const api = {
  /** GET /api/majors */
  getMajors: async () => {
    if (USE_MOCK) return mock('getMajors');
    const data = await request('GET', '/majors');
    return { ...data, majors: mergeMajors(data?.majors ?? []) };
  },
  /** GET /api/units?major={id} */
  getUnits: async (major) => {
    if (USE_MOCK) return mock('getUnits', major);
    const data = await request('GET', `/units?major=${encodeURIComponent(major)}`);
    return { ...data, units: mergeUnitsForMajor(major, data?.units ?? []) };
  },
  /** POST /api/recommend */
  recommend: (major, completedUnits) =>
    USE_MOCK
      ? mock('recommend', major, completedUnits)
      : request('POST', '/recommend', { major, completed_units: completedUnits }),
  /** GET /api/students/{student_id} */
  getStudent: (studentId) =>
    USE_MOCK ? mock('getStudent', studentId) : request('GET', `/students/${encodeURIComponent(studentId)}`),
  /** PUT /api/students/{student_id} */
  saveStudent: (studentId, payload) =>
    USE_MOCK
      ? mock('saveStudent', studentId, payload)
      : request('PUT', `/students/${encodeURIComponent(studentId)}`, payload),
  /** POST /api/students/{student_id}/plan */
  planStudent: (studentId, payload = {}) =>
    USE_MOCK
      ? mock('planStudent', studentId, payload)
      : request('POST', `/students/${encodeURIComponent(studentId)}/plan`, payload),
  /** POST /api/chat */
  chat: (question, history = [], studentId = null) => {
    const hasStudent = studentId !== null && studentId !== undefined && studentId !== '';
    if (USE_MOCK) return mock('chat', question, hasStudent ? Number(studentId) : null);
    const body = hasStudent ? { question, history, student_id: Number(studentId) } : { question, history };
    return request('POST', '/chat', body);
  },
};
