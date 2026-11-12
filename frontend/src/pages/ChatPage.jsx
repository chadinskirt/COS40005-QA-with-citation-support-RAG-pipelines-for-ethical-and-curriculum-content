import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAppState } from '../state/AppState.jsx';
import Icon from '../components/Icon.jsx';
import AssistantMessage from '../components/AssistantMessage.jsx';
import { SourcePanel, SourcesHint, WhyNoAnswer } from '../components/SidePanels.jsx';

const SUGGESTIONS = [
  'What is the prerequisite for COS30019?',
  'How is COS20007 assessed?',
  'What do I need to pass COS30019?',
];
const NO_ANSWER_TEXT = 'No answer found in the approved documents.';

// Figma S3 and S4, plus the chat states of S6
export default function ChatPage() {
  const { messages, setMessages, selected, setSelected, newId } = useAppState();
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const busy = messages.some((m) => m.status === 'pending');
  const lastReply = [...messages].reverse().find((m) => m.role === 'assistant' && m.status === 'done');

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const select = (msg, citation, index) =>
    setSelected({ msgId: msg.id, citation, index, threshold: msg.result.threshold });

  async function ask(question) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages
      .filter((m) => m.role === 'assistant' && m.status === 'done')
      .flatMap((m) => [
        { role: 'user', content: m.question },
        { role: 'assistant', content: m.result.answer ?? NO_ANSWER_TEXT },
      ]);
    const userMsg = { id: newId(), role: 'user', text: q };
    const reply = { id: newId(), role: 'assistant', userId: userMsg.id, question: q, status: 'pending' };
    setMessages((ms) => [...ms, userMsg, reply]);
    setDraft('');
    try {
      const result = await api.chat(q, history);
      const done = { ...reply, status: 'done', result };
      setMessages((ms) => ms.map((m) => (m.id === reply.id ? done : m)));
      if (result.abstained || result.citations.length === 0) setSelected(null);
      else select(done, result.citations[0], 1);
    } catch (error) {
      setMessages((ms) => ms.map((m) => (m.id === reply.id ? { ...reply, status: 'error', error } : m)));
    }
  }

  function retry(msg) {
    setMessages((ms) => ms.filter((m) => m.id !== msg.id && m.id !== msg.userId));
    ask(msg.question);
  }

  function rephrase(question) {
    setDraft(question);
    inputRef.current?.focus();
  }

  let panel = <SourcesHint />;
  if (selected) panel = <SourcePanel selected={selected} />;
  else if (lastReply?.result.abstained) panel = <WhyNoAnswer result={lastReply.result} />;

  return (
    <div className="chat-layout">
      <section className="card card--flat chat" aria-label="Ask the syllabus">
        <div className="thread" role="log">
          {messages.length === 0 && (
            <div className="stack gap-4 empty">
              <div className="row gap-2">
                <span className="c-brand">
                  <Icon name="chat" size={24} />
                </span>
                <h1 className="t-h2">Ask anything about your units</h1>
              </div>
              <p className="t-small c-secondary">
                Answers come from approved syllabus documents and always show their sources.
              </p>
              <div className="row wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="major-chip" onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <p key={m.id} className="msg-user t-body">
                {m.text}
              </p>
            ) : (
              <AssistantMessage
                key={m.id}
                msg={m}
                selected={selected}
                onSelect={(citation, index) => select(m, citation, index)}
                onRetry={() => retry(m)}
                onRephrase={() => rephrase(m.question)}
              />
            )
          )}
          <div ref={endRef} />
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <label className="field">
            <span className="sr-only">Your question</span>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about units and prerequisites…"
              maxLength={500}
            />
            <button type="submit" className="send-btn" disabled={!draft.trim() || busy} aria-label="Send question">
              <Icon name="send" size={18} />
            </button>
          </label>
          <p className="t-caption c-secondary">
            Answers come only from approved syllabus documents. Confirm enrolment decisions with an academic advisor.
          </p>
        </form>
      </section>

      <aside className="side-panel">{panel}</aside>
    </div>
  );
}
