import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AppStateProvider, useAppState } from './AppState.jsx';

const setup = () => renderHook(() => useAppState(), { wrapper: AppStateProvider });

describe('AppState', () => {
  it('starts empty with no hardcoded major or units', () => {
    const { result } = setup();
    expect(result.current.major).toBe('');
    expect(result.current.completed.size).toBe(0);
    expect(result.current.plan).toEqual({ status: 'idle' });
  });

  it('toggles units on and off', () => {
    const { result } = setup();
    act(() => result.current.toggleUnit('COS10009'));
    expect(result.current.completed.has('COS10009')).toBe(true);
    act(() => result.current.toggleUnit('COS10009'));
    expect(result.current.completed.size).toBe(0);
  });

  it('clears the selection when the major changes, but not when it stays the same', () => {
    const { result } = setup();
    act(() => result.current.selectMajor('data-science'));
    act(() => result.current.toggleUnit('COS10009'));
    act(() => result.current.selectMajor('data-science'));
    expect(result.current.completed.size).toBe(1);
    act(() => result.current.selectMajor('cybersecurity'));
    expect(result.current.major).toBe('cybersecurity');
    expect(result.current.completed.size).toBe(0);
  });

  it('hands out unique message ids', () => {
    const { result } = setup();
    const ids = [result.current.newId(), result.current.newId(), result.current.newId()];
    expect(new Set(ids).size).toBe(3);
  });
});
