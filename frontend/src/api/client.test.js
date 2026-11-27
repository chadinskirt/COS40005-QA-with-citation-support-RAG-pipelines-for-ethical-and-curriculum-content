import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Loads the client in real mode (VITE_USE_MOCK=false) with a fake fetch.
async function loadClient() {
  vi.resetModules();
  vi.stubEnv('VITE_USE_MOCK', 'false');
  return import('./client.js');
}
const reply = (status, body) =>
  vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    statusText: 'Status text',
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  });

beforeEach(() => vi.useRealTimers());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends recommend as POST /api/recommend with the profile split by status', async () => {
    const fetch = reply(200, { semesters: [] });
    vi.stubGlobal('fetch', fetch);
    const { api } = await loadClient();
    const profile = {
      major: 'data-science',
      units: {
        COS10009: { status: 'passed', grade: 'HD' },
        COS20007: { status: 'failed' },
        TNE10006: { status: 'enrolled' },
      },
    };
    await api.recommend(profile, 3);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/recommend');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      major: 'data-science',
      completed_units: ['COS10009'],
      failed_units: ['COS20007'],
      enrolled_units: ['TNE10006'],
      units_per_semester: 3,
    });
  });

  it('sends chat history and scope, and the plan only when given', async () => {
    const fetch = reply(200, { answer: 'ok', citations: [], abstained: false });
    vi.stubGlobal('fetch', fetch);
    const { api } = await loadClient();
    await api.chat('Q?', [{ role: 'user', content: 'a' }]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      question: 'Q?',
      history: [{ role: 'user', content: 'a' }],
      scope: ['outlines'],
    });
    await api.chat('Q?', [], { scope: ['outlines', 'plan'], plan: { major: 'x' } });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
      scope: ['outlines', 'plan'],
      plan: { major: 'x' },
    });
    await api.getUnits('a b');
    expect(fetch.mock.calls[2][0]).toBe('/api/units?major=a%20b');
  });

  it("reads today's backend citations into the v1.2 shape", async () => {
    const { normalizeCitation } = await loadClient();
    expect(
      normalizeCitation({
        source_file: 'COS30019 (prerequisites)',
        text_snippet: 'Unit COS30019 - Intro to AI (requisites):\nCOS20007 OR COS30008',
        similarity_score: 0.4,
      })
    ).toEqual({
      doc: 'COS30019 Unit Outline',
      section: 'Prerequisites',
      page: null,
      date: null,
      quote: 'COS20007 OR COS30008',
      url: null,
    });
    expect(
      normalizeCitation({ doc: 'D', section: 'S', page: 2, snippet: 'old', outline_date: 'Jan 2026' })
    ).toMatchObject({
      quote: 'old',
      page: 2,
      date: 'Jan 2026',
    });
  });

  it('treats the "LLM connection failed" text as a service error, not an answer', async () => {
    vi.stubGlobal(
      'fetch',
      reply(200, { answer: 'LLM connection failed. Error: refused', citations: [], abstained: false })
    );
    const { api } = await loadClient();
    await expect(api.chat('Q?')).rejects.toMatchObject({ status: 503, code: 'LLM_UNAVAILABLE' });
  });

  it('posts a plan to /api/plans to get a share code', async () => {
    const fetch = reply(200, { code: 'A7-3K' });
    vi.stubGlobal('fetch', fetch);
    const { api } = await loadClient();
    await expect(api.sharePlan({ major: 'x', units: {} })).resolves.toEqual({ code: 'A7-3K' });
    expect(fetch.mock.calls[0][0]).toBe('/api/plans');
  });

  it('turns the contract error shape into an ApiError', async () => {
    const error = { code: 'CURRICULUM_CYCLE', message: 'cycle', details: { cycle: ['A', 'B', 'A'] } };
    vi.stubGlobal('fetch', reply(409, { error }));
    const { api } = await loadClient();
    await expect(api.getMajors()).rejects.toMatchObject({
      status: 409,
      code: 'CURRICULUM_CYCLE',
      details: error.details,
    });
  });

  it('maps the FastAPI default 422 body to VALIDATION_ERROR', async () => {
    vi.stubGlobal('fetch', reply(422, { detail: [{ msg: 'bad' }] }));
    const { api } = await loadClient();
    await expect(api.getMajors()).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
  });

  it('maps 502 to SERVICE_UNAVAILABLE and other bodies to HTTP_<status>', async () => {
    vi.stubGlobal('fetch', reply(502));
    let { api } = await loadClient();
    await expect(api.getMajors()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    vi.stubGlobal('fetch', reply(418));
    ({ api } = await loadClient());
    await expect(api.getMajors()).rejects.toMatchObject({ code: 'HTTP_418' });
  });

  it('reports NETWORK_ERROR when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    const { api } = await loadClient();
    await expect(api.getMajors()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('times out a hanging request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }) =>
          new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
          )
      )
    );
    const { api } = await loadClient();
    const result = expect(api.getMajors()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'The request timed out.',
    });
    await vi.advanceTimersByTimeAsync(65000);
    await result;
  });

  it('rejects a successful response with an unreadable body', async () => {
    vi.stubGlobal('fetch', reply(200));
    const { api } = await loadClient();
    await expect(api.getMajors()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('uses the mock without calling fetch when VITE_USE_MOCK=true', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCK', 'true');
    const { api } = await import('./client.js');
    const result = await api.getMajors();
    expect(result.majors.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
