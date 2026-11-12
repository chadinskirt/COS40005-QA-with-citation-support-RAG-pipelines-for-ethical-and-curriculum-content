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
  it('sends recommend as POST /api/recommend with snake_case fields', async () => {
    const fetch = reply(200, { semesters: [] });
    vi.stubGlobal('fetch', fetch);
    const { api } = await loadClient();
    await api.recommend('data-science', ['COS10009']);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/recommend');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ major: 'data-science', completed_units: ['COS10009'] });
  });

  it('sends chat history and encodes the major in the units query', async () => {
    const fetch = reply(200, {});
    vi.stubGlobal('fetch', fetch);
    const { api } = await loadClient();
    await api.chat('Q?', [{ role: 'user', content: 'a' }]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      question: 'Q?',
      history: [{ role: 'user', content: 'a' }],
    });
    await api.getUnits('a b');
    expect(fetch.mock.calls[1][0]).toBe('/api/units?major=a%20b');
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
    await vi.advanceTimersByTimeAsync(15000);
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
