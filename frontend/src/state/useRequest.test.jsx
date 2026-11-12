import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRequest } from './useRequest.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe('useRequest', () => {
  it('goes from loading to data', async () => {
    const fn = () => Promise.resolve('ok');
    const { result } = renderHook(() => useRequest(fn));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current).toMatchObject({ loading: false, data: 'ok', error: null }));
  });

  it('exposes the error and clears it on retry', async () => {
    let fail = true;
    const fn = () => (fail ? Promise.reject(new Error('boom')) : Promise.resolve('fine'));
    const { result } = renderHook(() => useRequest(fn));
    await waitFor(() => expect(result.current.error?.message).toBe('boom'));
    fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current).toMatchObject({ data: 'fine', error: null }));
  });

  it('does nothing when fn is null', () => {
    const { result } = renderHook(() => useRequest(null));
    expect(result.current).toMatchObject({ loading: false, data: null, error: null });
  });

  it('ignores a slow response that was superseded', async () => {
    const first = deferred();
    const second = deferred();
    const fnA = () => first.promise;
    const fnB = () => second.promise;
    const { result, rerender } = renderHook(({ fn }) => useRequest(fn), { initialProps: { fn: fnA } });
    rerender({ fn: fnB });
    second.resolve('new');
    await waitFor(() => expect(result.current.data).toBe('new'));
    await act(async () => first.resolve('old'));
    expect(result.current.data).toBe('new');
  });

  it('drops old data while a new request loads', async () => {
    const next = deferred();
    const fnA = () => Promise.resolve('A');
    const fnB = () => next.promise;
    const { result, rerender } = renderHook(({ fn }) => useRequest(fn), { initialProps: { fn: fnA } });
    await waitFor(() => expect(result.current.data).toBe('A'));
    rerender({ fn: fnB });
    await waitFor(() => expect(result.current).toMatchObject({ loading: true, data: null }));
  });
});
