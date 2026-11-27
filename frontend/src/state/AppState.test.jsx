import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { api } from '../api/client.js';
import { AppStateProvider, STORAGE_KEY, useAppState } from './AppState.jsx';

vi.mock('../api/client.js', () => ({ api: { getUnits: vi.fn(), recommend: vi.fn() } }));

const PLAN = { major: { id: 'x', name: 'X' }, semesters: [], blocked_units: [], dag_graph: { nodes: [], edges: [] } };
const setup = () => renderHook(() => useAppState(), { wrapper: AppStateProvider });

beforeEach(() => {
  api.getUnits.mockResolvedValue({ units: [] });
  api.recommend.mockResolvedValue(PLAN);
});
afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
});

describe('AppState', () => {
  it('starts with no profile and does not plan until there is one', async () => {
    const { result } = setup();
    expect(result.current.profile).toBeNull();
    expect(result.current.plan).toEqual({ status: 'idle' });
    await waitFor(() => expect(api.getUnits).toHaveBeenCalledWith('artificial-intelligence'));
    expect(api.recommend).not.toHaveBeenCalled();
  });

  it('plans when a profile is set and again when the load changes', async () => {
    const { result } = setup();
    const profile = { major: 'data-science', units: { COS10009: { status: 'passed' } } };
    act(() => result.current.setProfile(profile));
    await waitFor(() => expect(result.current.plan.status).toBe('done'));
    expect(api.recommend).toHaveBeenLastCalledWith(profile, 3);
    act(() => result.current.setLoad(4));
    await waitFor(() => expect(api.recommend).toHaveBeenLastCalledWith(profile, 4));
  });

  it('drops swaps when the plan they were made on changes', async () => {
    const { result } = setup();
    act(() => result.current.setProfile({ major: 'x', units: {} }));
    act(() => result.current.addSwap('A', 'B'));
    expect(result.current.swaps).toEqual([['A', 'B']]);
    act(() => result.current.setLoad(2));
    await waitFor(() => expect(result.current.swaps).toEqual([]));
  });

  it('saves to this browser only on Save plan, and reads it back', async () => {
    const { result, unmount } = setup();
    act(() => result.current.setProfile({ major: 'x', units: { A: { status: 'passed', grade: 'HD' } } }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.saved).toBe(false);
    act(() => result.current.savePlan());
    expect(result.current.saved).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).profile.units.A.grade).toBe('HD');
    unmount();

    const again = setup();
    expect(again.result.current.profile.units.A.status).toBe('passed');
    expect(again.result.current.saved).toBe(true);
    act(() => again.result.current.forgetPlan());
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores a broken saved value', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const { result } = setup();
    expect(result.current.profile).toBeNull();
  });

  it('hands out unique message ids', () => {
    const { result } = setup();
    const ids = [result.current.newId(), result.current.newId(), result.current.newId()];
    expect(new Set(ids).size).toBe(3);
  });
});
