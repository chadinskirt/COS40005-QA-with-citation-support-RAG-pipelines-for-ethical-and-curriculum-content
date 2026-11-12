import { useCallback, useEffect, useState } from 'react';

// Runs fn and tracks loading, error and data. Re-runs when fn changes or on retry; pass null to skip.
// A superseded call never updates state.
export function useRequest(fn) {
  const [state, setState] = useState({ loading: Boolean(fn), error: null, data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!fn) {
      setState({ loading: false, error: null, data: null });
      return undefined;
    }
    let current = true;
    setState({ loading: true, error: null, data: null });
    fn().then(
      (data) => current && setState({ loading: false, error: null, data }),
      (error) => current && setState({ loading: false, error, data: null })
    );
    return () => {
      current = false;
    };
  }, [fn, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
