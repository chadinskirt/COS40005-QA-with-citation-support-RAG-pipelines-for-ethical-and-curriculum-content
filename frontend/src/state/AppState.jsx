// In-memory only: nothing goes to localStorage or cookies.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const Ctx = createContext(null);

export function AppStateProvider({ children }) {
  // First-Year mode state
  const [major, setMajor] = useState('');
  const [completed, setCompleted] = useState(() => new Set());
  const [plan, setPlan] = useState({ status: 'idle' });
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null); // source open in the chat side panel
  const lastId = useRef(0);

  // Mode toggle: 'first-year' | 'current-student'
  const [mode, setMode] = useState('first-year');

  // Current Student mode state
  const [studentId, setStudentId] = useState('');
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [studentLookup, setStudentLookup] = useState({ status: 'idle' });
  const [studentSave, setStudentSave] = useState({ status: 'idle' });
  const [studentMajor, setStudentMajor] = useState('');
  const [targetCareer, setTargetCareer] = useState('');
  const [studyGoal, setStudyGoal] = useState('');
  const [unitsPerSemester, setUnitsPerSemester] = useState(4);
  const [passedUnits, setPassedUnits] = useState(() => new Set());
  const [failedUnits, setFailedUnits] = useState(() => new Set());
  const [enrolledUnits, setEnrolledUnits] = useState(() => new Set());
  const [studentPlan, setStudentPlan] = useState({ status: 'idle' });

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

  // Preserve passed/enrolled/failed units when switching majors in Current Student mode.
  const selectStudentMajor = useCallback(
    (id) => {
      if (id === studentMajor) return;
      setStudentMajor(id);
    },
    [studentMajor]
  );

  // Mutually exclusive assignment into passed | enrolled | failed (clicking active status unassigns)
  const assignUnitStatus = useCallback((code, targetStatus) => {
    setPassedUnits((prevPassed) => {
      const wasPassed = prevPassed.has(code);
      const next = new Set(prevPassed);
      next.delete(code);
      if (targetStatus === 'passed' && !wasPassed) next.add(code);
      return next;
    });
    setEnrolledUnits((prevEnrolled) => {
      const wasEnrolled = prevEnrolled.has(code);
      const next = new Set(prevEnrolled);
      next.delete(code);
      if (targetStatus === 'enrolled' && !wasEnrolled) next.add(code);
      return next;
    });
    setFailedUnits((prevFailed) => {
      const wasFailed = prevFailed.has(code);
      const next = new Set(prevFailed);
      next.delete(code);
      if (targetStatus === 'failed' && !wasFailed) next.add(code);
      return next;
    });
  }, []);

  const clearStudentUnits = useCallback(() => {
    setPassedUnits(new Set());
    setFailedUnits(new Set());
    setEnrolledUnits(new Set());
  }, []);

  const hydrateStudentProfile = useCallback((data) => {
    if (data.student_id != null) {
      setStudentId(String(data.student_id));
      setActiveStudentId(Number(data.student_id));
    }
    if (data.major_code) setStudentMajor(data.major_code);
    setTargetCareer(data.target_career ?? '');
    setStudyGoal(data.study_goal ?? '');
    setPassedUnits(new Set(data.passed_units ?? []));
    setFailedUnits(new Set(data.failed_units ?? []));
    setEnrolledUnits(new Set(data.enrolled_units ?? []));
  }, []);

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
      mode,
      setMode,
      studentId,
      setStudentId,
      activeStudentId,
      setActiveStudentId,
      studentLookup,
      setStudentLookup,
      studentSave,
      setStudentSave,
      studentMajor,
      selectStudentMajor,
      targetCareer,
      setTargetCareer,
      studyGoal,
      setStudyGoal,
      unitsPerSemester,
      setUnitsPerSemester,
      passedUnits,
      failedUnits,
      enrolledUnits,
      assignUnitStatus,
      clearStudentUnits,
      studentPlan,
      setStudentPlan,
      hydrateStudentProfile,
    }),
    [
      major,
      selectMajor,
      completed,
      toggleUnit,
      clearUnits,
      plan,
      messages,
      selected,
      newId,
      mode,
      studentId,
      activeStudentId,
      studentLookup,
      studentSave,
      studentMajor,
      selectStudentMajor,
      targetCareer,
      studyGoal,
      unitsPerSemester,
      passedUnits,
      failedUnits,
      enrolledUnits,
      assignUnitStatus,
      clearStudentUnits,
      studentPlan,
      hydrateStudentProfile,
    ]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAppState = () => useContext(Ctx);
