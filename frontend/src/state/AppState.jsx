// In-memory only: nothing goes to localStorage or cookies.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const Ctx = createContext(null);

export function AppStateProvider({ children }) {
  const [major, setMajor] = useState('');
  const [completed, setCompleted] = useState(() => new Set());
  const [plan, setPlan] = useState({ status: 'idle' });
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null); // source open in the chat side panel
  const lastId = useRef(0);

  // Units differ per major, so changing major clears the selection.
  const selectMajor = useCallback(
    (id) => {
      if (id === major) return;
      setMajor(id);
      setCompleted(new Set());
    },
    [major]
  );
  const toggleUnit = useCallback((code) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  }, []);
  const clearUnits = useCallback(() => setCompleted(new Set()), []);
  const newId = useCallback(() => ++lastId.current, []);

  const value = useMemo(
    () => ({
      major,
      selectMajor,
      completed,
      toggleUnit,
      clearUnits,
      plan,
      setPlan,
      messages,
      setMessages,
      selected,
      setSelected,
      newId,
    }),
    [major, selectMajor, completed, toggleUnit, clearUnits, plan, messages, selected, newId]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAppState = () => useContext(Ctx);
