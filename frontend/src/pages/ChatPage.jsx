import { useCallback, useEffect, useRef, useState } from 'react';
import { api, planBody } from '../api/client.js';
import AssistantMessage from '../components/AssistantMessage.jsx';
import Button, { IconButton } from '../components/Button.jsx';
import Composer from '../components/Composer.jsx';
import { useModal } from '../components/Dialog.jsx';
<<<<<<< Updated upstream
import DocumentViewerDrawer from '../components/DocumentViewerDrawer.jsx';
=======
>>>>>>> Stashed changes
import Icon from '../components/Icon.jsx';
import SourcesPanel from '../components/SourcesPanel.jsx';
import { TopBar } from '../components/Shell.jsx';
import { categoryLabel } from '../components/Badge.jsx';
import { getUnitCategory } from '../data/csMajors.js';
import { termLabel } from '../lib/terms.js';
import { useAppState } from '../state/AppState.jsx';

const SUGGESTIONS = ['Can I take COS30019 next semester?', 'How do I pass the AI unit?', 'Compare Data Science and AI'];
const NO_ANSWER = 'No answer found in the approved documents.';
const topicOf = (q) => (q.length > 48 ? `${q.slice(0, 46).trimEnd()}…` : q);
<<<<<<< Updated upstream
// Module-level guard survives React StrictMode unmount/remount cycles.
let lastHandledPromptId = null;
=======
>>>>>>> Stashed changes

// Figma: Ask the assistant, Rich answer, and the chat states in System states.
export default function ChatPage() {
  const {
    messages,
    setMessages,
    newId,
    scope,
    setScope,
    profile,
    load,
    start,
    view,
    pendingQuestion,
    setPendingQuestion,
<<<<<<< Updated upstream
    pendingUnitPrompt,
    setPendingUnitPrompt,
=======
>>>>>>> Stashed changes
    draft,
    setDraft,
    major,
  } = useAppState();
  const [selected, setSelected] = useState(null); // { msgId, n }
  const [drawer, setDrawer] = useState(false);
<<<<<<< Updated upstream
  const [viewerOpen, setViewerOpen] = useState(true);
=======
>>>>>>> Stashed changes
  const input = useRef(null);
  const endRef = useRef(null);
  const busy = messages.some((m) => m.status === 'pending');

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const ask = useCallback(
    async (question, msgs = messages) => {
      const q = question.trim();
      if (!q) return;
      const history = msgs
        .filter((m) => m.role === 'assistant' && m.status === 'done')
        .flatMap((m) => [
          { role: 'user', content: m.question },
          { role: 'assistant', content: m.result.answer ?? NO_ANSWER },
        ]);
      const usePlan = scope.includes('plan') && profile;
<<<<<<< Updated upstream
      // Grades travel inside the plan, so they are only sent when the plan is.
      const useGrades = usePlan && scope.includes('grades');
      const plan = usePlan && {
        ...planBody(profile, load),
        start_term: termLabel(start),
        ...(useGrades && {
=======
      const plan = usePlan && {
        ...planBody(profile, load),
        start_term: termLabel(start),
        ...(scope.includes('grades') && {
>>>>>>> Stashed changes
          grades: Object.fromEntries(
            Object.entries(profile.units)
              .filter(([, u]) => u.grade)
              .map(([c, u]) => [c, u.grade])
          ),
        }),
      };
      const user = { id: newId(), role: 'user', text: q };
      const reply = {
        id: newId(),
        userId: user.id,
        role: 'assistant',
        question: q,
        status: 'pending',
<<<<<<< Updated upstream
        scope: scope.filter((s) => (s === 'plan' ? usePlan : s === 'grades' ? useGrades : true)),
=======
        scope: usePlan ? scope : scope.filter((s) => s !== 'plan'),
>>>>>>> Stashed changes
      };
      setMessages([...msgs, user, reply]);
      setDraft('');
      try {
        const result = await api.chat(q, history, { scope: reply.scope, plan });
        setMessages((ms) => ms.map((m) => (m.id === reply.id ? { ...reply, status: 'done', result } : m)));
        // An answer without sources leaves the panel on the last one that had some.
<<<<<<< Updated upstream
        if (result.citations.length) {
          setSelected({ msgId: reply.id, n: 1 });
          setViewerOpen(true);
        }
=======
        if (result.citations.length) setSelected({ msgId: reply.id, n: 1 });
>>>>>>> Stashed changes
      } catch (error) {
        setMessages((ms) => ms.map((m) => (m.id === reply.id ? { ...reply, status: 'error', error } : m)));
      }
    },
    [messages, scope, profile, load, start, newId, setMessages, setDraft]
  );

  // A question sent from Home or the unit search. The ref keeps this effect tied to the question only.
  const askRef = useRef(ask);
  askRef.current = ask;
<<<<<<< Updated upstream
  // While an answer is still loading the question waits, then goes once it is done.
  useEffect(() => {
    if (!pendingQuestion || busy) return;
    setPendingQuestion(null);
    askRef.current(pendingQuestion);
  }, [pendingQuestion, busy, setPendingQuestion]);

  // Auto-send "Discuss in Chat" prompt once, guarded against React StrictMode double-fires.
  useEffect(() => {
    if (!pendingUnitPrompt || busy) return;
    if (lastHandledPromptId === pendingUnitPrompt.id) return;
    lastHandledPromptId = pendingUnitPrompt.id;
    const { prompt } = pendingUnitPrompt;
    setPendingUnitPrompt(null);
    askRef.current(prompt);
  }, [pendingUnitPrompt, busy, setPendingUnitPrompt]);
=======
  useEffect(() => {
    if (!pendingQuestion) return;
    setPendingQuestion(null);
    askRef.current(pendingQuestion);
  }, [pendingQuestion, setPendingQuestion]);
>>>>>>> Stashed changes

  const focusComposer = (text) => {
    setDraft(text);
    requestAnimationFrame(() => {
      const el = input.current;
      el?.focus();
      el?.setSelectionRange(text.length, text.length);
    });
  };

  function retry(msg) {
    const rest = messages.filter((m) => m.id !== msg.id && m.id !== msg.userId);
    ask(msg.question, rest);
  }

  const answers = messages.filter((m) => m.role === 'assistant' && m.status === 'done' && m.result.citations.length);
  const shownMsg = messages.find((m) => m.id === selected?.msgId) ?? answers[answers.length - 1];
  const citations = shownMsg?.result.citations ?? [];
  const openN = shownMsg && selected?.msgId === shownMsg.id ? selected.n : null;

  const openCite = (msg) => (n) => {
    setSelected((s) => (s?.msgId === msg.id && s.n === n ? { msgId: msg.id, n: null } : { msgId: msg.id, n }));
<<<<<<< Updated upstream
    setViewerOpen(true);
=======
>>>>>>> Stashed changes
    if (window.matchMedia?.('(max-width: 1279px)').matches) setDrawer(true);
  };

  // Colours the prerequisite map from the student's own plan.
  const unitStatus = (code) => {
    const rec = profile?.units[code];
    const term = view?.termOf[code];
    const first = view?.semesters[0]?.includes(code);
    if (rec?.status === 'passed') return { status: 'passed', label: 'Passed' };
    if (rec?.status === 'enrolled') return { status: 'enrolled', label: 'Enrolled now' };
    if (rec?.status === 'failed') return { status: 'retake', label: term ? `Retake, ${termLabel(term)}` : 'Retake' };
    if (term) return { status: first ? 'now' : 'planned', label: termLabel(term) };
    return {};
  };
  const unitNote = (o) => {
    const term = view?.termOf[o.code];
    const kind = `${categoryLabel(getUnitCategory(o.code, profile?.major ?? major))} unit`;
    return term
      ? `${kind} · ${termLabel(term)} in your plan`
      : o.note && o.note !== kind
        ? `${kind} · ${o.note}`
        : kind;
  };

  const firstQuestion = messages.find((m) => m.role === 'user')?.text;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
<<<<<<< Updated upstream
  const grades = Boolean(profile) && scope.includes('plan') && scope.includes('grades');
  const toggle = (s) => setScope((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const selectedCitation = openN ? citations[openN - 1] : null;
  const hasViewerContent = Boolean(
    selectedCitation &&
      (selectedCitation.document_url ||
        selectedCitation.url ||
        selectedCitation.content ||
        selectedCitation.snippet ||
        selectedCitation.quote)
  );

  const sources = (
    <>
      <SourcesPanel
        citations={citations}
        open={openN}
        onToggle={(n) => {
          const next = openN === n ? null : n;
          setSelected({ msgId: shownMsg.id, n: next });
          if (next) setViewerOpen(true);
        }}
        onViewPdf={(n) => {
          setSelected({ msgId: shownMsg.id, n });
          setViewerOpen(true);
        }}
      />
      {viewerOpen && hasViewerContent && (
        <DocumentViewerDrawer
          citation={selectedCitation}
          index={openN}
          citations={citations}
          threshold={shownMsg?.result?.threshold}
          onSelectCitation={(_, idx) => {
            setSelected({ msgId: shownMsg.id, n: idx });
            setViewerOpen(true);
          }}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
=======
  const toggle = (s) => setScope((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const sources = (
    <SourcesPanel
      citations={citations}
      open={openN}
      onToggle={(n) => setSelected({ msgId: shownMsg.id, n: openN === n ? null : n })}
    />
>>>>>>> Stashed changes
  );

  return (
    <>
      <TopBar
        actions={
          <>
            {citations.length > 0 && (
              <Button variant="ghost" className="show-narrow-desktop" onClick={() => setDrawer(true)}>
                <Icon name="file" size={16} className="c-source" />
                Sources ({citations.length})
              </Button>
            )}
            <Button variant="secondary" onClick={() => setMessages([])} disabled={!messages.length || busy}>
              New chat
            </Button>
          </>
        }
      >
        <nav aria-label="Breadcrumb" className="crumbs">
          {firstQuestion ? (
            <>
              <span className="c-muted">Ask the assistant</span>
              <Icon name="chevronRight" size={14} className="c-muted" />
              <span aria-current="page">{topicOf(firstQuestion)}</span>
            </>
          ) : (
            <span aria-current="page">Ask the assistant</span>
          )}
        </nav>
      </TopBar>

      <div className="chat">
        <section className="chat__main" aria-label="Conversation">
          <h1 className="sr-only">Ask the assistant</h1>
          <div className="thread" role="log" aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p className="t-h2">Ask about a unit, a prerequisite or your plan</p>
                <p className="t-small c-secondary">
                  Answers come from the approved unit outlines and link to the page they used. If the outlines
                  don&apos;t cover a question, the assistant says so.
                </p>
                <div className="row wrap gap-8">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="chip" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <p key={m.id} className="bubble">
                  {m.text}
                </p>
              ) : (
                <AssistantMessage
                  key={m.id}
                  msg={m}
                  scope={scope}
                  activeCite={selected?.msgId === m.id ? selected.n : null}
                  onCite={openCite(m)}
                  onRetry={() => retry(m)}
                  onRephrase={() => focusComposer(m.question)}
                  onChoose={(o) => ask(`Yes, ${o.code} ${o.name}`)}
                  onAnother={() => focusComposer('I mean ')}
                  answered={m !== lastAssistant}
                  unitStatus={unitStatus}
                  unitNote={unitNote}
                  onOpenSources={() => {
                    setSelected({ msgId: m.id, n: selected?.msgId === m.id ? selected.n : null });
                    setDrawer(true);
                  }}
                />
              )
            )}
            <div ref={endRef} />
          </div>

          <div className="chat__composer">
            <Composer
              ref={input}
              value={draft}
              onChange={setDraft}
              onSubmit={(q) => ask(q)}
              disabled={busy}
              placeholder={
                messages.length ? 'Ask a follow-up, for example "What if I fail COS20007 again?"' : 'Ask a question'
              }
            >
              <span className="scope scope--on" title="Answers always use the approved unit outlines">
                <Icon name="book" size={13} />
                Unit outlines
              </span>
              <button
                type="button"
                className="scope"
                aria-pressed={scope.includes('plan') && Boolean(profile)}
                disabled={!profile}
                title={profile ? 'Let the assistant read your plan' : 'Make a plan first to use it here'}
                onClick={() => toggle('plan')}
              >
                <Icon name="calendar" size={13} />
                My plan
              </button>
              <button
                type="button"
                className="scope"
<<<<<<< Updated upstream
                aria-pressed={grades}
                disabled={!profile || !scope.includes('plan')}
                title={scope.includes('plan') ? 'Off unless you turn it on' : 'Turn on My plan to share grades'}
                onClick={() => toggle('grades')}
              >
                <Icon name={grades ? 'check' : 'plus'} size={13} />
=======
                aria-pressed={scope.includes('grades') && Boolean(profile)}
                disabled={!profile}
                title="Off unless you turn it on"
                onClick={() => toggle('grades')}
              >
                <Icon name={scope.includes('grades') && profile ? 'check' : 'plus'} size={13} />
>>>>>>> Stashed changes
                Past grades
              </button>
            </Composer>
            <p className="chat__disclaimer">
              Answers use the approved unit outlines, the course structure and your plan. Check enrolment decisions with
              your advisor.
            </p>
          </div>
        </section>

        <aside className="chat__sources" aria-label="Sources">
          {sources}
        </aside>
      </div>

      {drawer && <SourcesDrawer onClose={() => setDrawer(false)}>{sources}</SourcesDrawer>}
    </>
  );
}

// Figma: Sources drawer, below 1280 px.
function SourcesDrawer({ onClose, children }) {
  const panel = useRef(null);
  useModal(panel, onClose);
  return (
    <div className="drawer-layer">
      <div className="scrim" aria-hidden="true" onClick={onClose} />
      <div ref={panel} className="drawer" role="dialog" aria-modal="true" aria-label="Sources" tabIndex={-1}>
        <div className="drawer__close">
          <IconButton label="Close sources" onClick={onClose} data-autofocus>
            <Icon name="x" size={16} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
