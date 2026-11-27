// App-wide state. The plan is saved to this browser only when the student presses Save plan;
// the chat lives in memory and is gone when the tab closes.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { getUnitCategory } from '../data/csMajors.js';
import { buildPlanView, STANDARD_LOAD } from '../lib/plan.js';
import { nextTerm, parseTermKey, termKey } from '../lib/terms.js';

export const STORAGE_KEY = 'advising-portal:plan';
const DEFAULT_MAJOR = 'artificial-intelligence';

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved?.profile?.units ? saved : null;
  } catch {
    return null;
  }
}

const Ctx = createContext(null);

export function AppStateProvider({ children }) {
  const saved = useRef(readSaved()).current;
  // profile: { major, units: { CODE: { status: 'passed' | 'failed' | 'enrolled', grade? } } } or null
  const [profile, setProfile] = useState(saved?.profile ?? null);
  const [start, setStart] = useState(() => parseTermKey(saved?.start) ?? nextTerm());
  const [load, setLoad] = useState([2, 3, 4].includes(saved?.load) ? saved.load : STANDARD_LOAD);
  const [swaps, setSwaps] = useState(saved?.swaps ?? []);
  const [savedAt, setSavedAt] = useState(saved ? JSON.stringify(saved) : null);
  const [plan, setPlan] = useState({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const [catalog, setCatalog] = useState([]);

  // Chat
  const [messages, setMessages] = useState([]);
  const [scope, setScope] = useState(['outlines', 'plan']);
  const [pendingQuestion, setPendingQuestion] = useState(null); // sent from Home or search
  const [draft, setDraft] = useState('');
  const lastId = useRef(0);
  const newId = useCallback(() => ++lastId.current, []);

  const major = profile?.major ?? DEFAULT_MAJOR;
  const planKey = profile ? JSON.stringify([profile.major, profile.units, load]) : null;
  const lastKey = useRef(planKey);

  // Unit names for the search box, the unit editor and the roadmap.
  useEffect(() => {
    let live = true;
    api.getUnits(major).then(
      (d) => live && setCatalog(d.units ?? []),
      () => live && setCatalog([])
    );
    return () => {
      live = false;
    };
  }, [major]);

  // Re-plan whenever the units or the load change. Swaps belong to the old plan, so they go.
  useEffect(() => {
    if (!planKey) return undefined;
    if (lastKey.current !== planKey) setSwaps([]);
    lastKey.current = planKey;
    let live = true;
    const [m, units, l] = JSON.parse(planKey);
    setPlan((p) => ({ status: 'loading', data: p.data, key: planKey }));
    api.recommend({ major: m, units }, l).then(
      (data) => live && setPlan({ status: 'done', data, key: planKey }),
      (error) => live && setPlan({ status: 'error', error, key: planKey })
    );
    return () => {
      live = false;
    };
  }, [planKey, attempt]);

  const retryPlan = useCallback(() => setAttempt((n) => n + 1), []);

  const names = useMemo(() => Object.fromEntries(catalog.map((u) => [u.code, u.name])), [catalog]);
  const view = useMemo(() => {
    // While a new plan loads the last one stays on screen, marked as updating.
    if (!plan.data || plan.status === 'error' || !profile) return null;
    return buildPlanView(plan.data, profile, {
      start,
      load,
      swaps,
      names,
      category: (code) => getUnitCategory(code, profile.major),
    });
  }, [plan, profile, start, load, swaps, names]);

  const snapshot = profile ? JSON.stringify({ profile, start: termKey(start), load, swaps }) : null;
  const savePlan = useCallback(() => {
    if (!snapshot) return false;
    try {
      localStorage.setItem(STORAGE_KEY, snapshot);
      setSavedAt(snapshot);
      return true;
    } catch {
      return false;
    }
  }, [snapshot]);

  const forgetPlan = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage can be blocked; nothing was saved then
    }
    setSavedAt(null);
    setProfile(null);
    setSwaps([]);
    setPlan({ status: 'idle' });
  }, []);

  const value = useMemo(
    () => ({
      profile,
      setProfile,
      major,
      start,
      setStart,
      load,
      setLoad,
      swaps,
      addSwap: (a, b) => setSwaps((s) => [...s, [a, b]]),
      plan,
      retryPlan,
      view,
      catalog,
      names,
      saved: snapshot !== null && snapshot === savedAt,
      hasSaved: savedAt !== null,
      savePlan,
      forgetPlan,
      messages,
      setMessages,
      scope,
      setScope,
      pendingQuestion,
      setPendingQuestion,
      draft,
      setDraft,
      newId,
    }),
    [
      profile,
      major,
      start,
      load,
      swaps,
      plan,
      retryPlan,
      view,
      catalog,
      names,
      snapshot,
      savedAt,
      savePlan,
      forgetPlan,
      messages,
      scope,
      pendingQuestion,
      draft,
      newId,
    ]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAppState = () => useContext(Ctx);
