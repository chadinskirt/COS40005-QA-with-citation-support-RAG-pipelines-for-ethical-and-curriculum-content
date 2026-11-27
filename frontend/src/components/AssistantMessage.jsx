import { useEffect, useState } from 'react';
import Button, { IconButton } from './Button.jsx';
import Icon from './Icon.jsx';
import MarkdownContent from './MarkdownContent.jsx';
import { Cite, UnitCode } from './Badge.jsx';
import { ServiceError, StateCard } from './States.jsx';
import { ADVISOR_URL, OUTLINE_COUNT } from '../config.js';

const seconds = (ms) => (ms != null ? `${(ms / 1000).toFixed(1)} s` : null);

// Steps the assistant took. Uses the backend's `steps` when it sends them, otherwise the counts it always sends.
function stepsOf(r, scope) {
  if (r.steps?.length) return r.steps;
  return [
    scope.includes('plan') && { label: 'Read your plan' },
    { label: `Searched ${r.sources_checked ?? 0} passages` },
    { label: `${r.sources_passed ?? 0} matched your question` },
  ].filter(Boolean);
}

// Figma: Agent steps (collapsed strip) and Reasoning (expanded list).
function Steps({ result, scope }) {
  const [open, setOpen] = useState(false);
  const steps = stepsOf(result, scope);
  const time = seconds(result.latency_ms);
  const hasDetail = steps.some((s) => s.detail);
  return (
    <div className={`steps${open ? ' steps--open' : ''}`}>
      <div className="steps__head">
        <Icon name="checkCircle" size={14} className="c-pass steps__summary-icon" />
        <span className="steps__summary">
          Reasoning done · {steps.length} step{steps.length === 1 ? '' : 's'}
          {time && ` · ${time}`}
        </span>
        <ul className="steps__strip">
          {steps.map((s, i) => (
            <li key={i}>
              <Icon name="check" size={12} className="c-pass" />
              {s.label}
            </li>
          ))}
          {time && <li className="c-muted">{time}</li>}
        </ul>
        {hasDetail && (
          <IconButton
            label={open ? 'Hide reasoning' : 'Show reasoning'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} />
          </IconButton>
        )}
      </div>
      {open && (
        <ol className="steps__detail">
          {steps.map((s, i) => (
            <li key={i}>
              <Icon name="checkCircle" size={14} className="c-muted" />
              {s.detail ?? s.label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const PENDING = ['Read your plan', 'Searching the unit outlines', 'Check prerequisite rules'];

// Figma: System states / Answer in progress. Steps advance on a timer; the last waits for the answer.
function Pending({ scope }) {
  const labels = scope.includes('plan') ? PENDING : PENDING.slice(1);
  const [step, setStep] = useState(scope.includes('plan') ? 1 : 0);
  useEffect(() => {
    if (step >= labels.length - 1) return undefined;
    const t = setTimeout(() => setStep((s) => s + 1), 900);
    return () => clearTimeout(t);
  }, [step, labels.length]);
  return (
    <div className="pending" role="status" aria-live="polite">
      <p className="sr-only">Answer in progress</p>
      <ol className="pending__steps">
        {labels.map((l, i) => (
          <li key={l} className={i < step ? 'is-done' : i === step ? 'is-active' : 'is-waiting'}>
            <span className="pending__dot" aria-hidden="true">
              {i < step && <Icon name="check" size={11} strokeWidth={2.5} />}
            </span>
            {l}
          </li>
        ))}
      </ol>
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--line skeleton--w80" />
      <div className="skeleton skeleton--line skeleton--w50" />
    </div>
  );
}

function Abstained({ result, onRephrase, onCite }) {
  if (result.abstain_reason === 'OUT_OF_SCOPE') {
    return (
      <div className="not-covered">
        <p className="not-covered__title">
          <Icon name="info" size={16} />
          The approved outlines don&apos;t cover this
        </p>
        <p className="not-covered__body">
          None of the {OUTLINE_COUNT} unit outlines I can read cover this, so I can&apos;t answer it. An academic
          advisor can help with it.
        </p>
        <div className="not-covered__actions">
          <Button variant="secondary" as="a" href={ADVISOR_URL}>
            Contact an advisor
          </Button>
          <Button variant="ghost" onClick={onRephrase}>
            Rephrase question
          </Button>
          <span className="t-caption c-muted not-covered__meta">No matching passage found</span>
        </div>
      </div>
    );
  }
  if (result.abstain_reason === 'UNIT_NOT_FOUND') {
    const code = result.unit ?? result.question?.match(/[A-Za-z]{3}\d{4,5}/)?.[0]?.toUpperCase();
    return (
      <StateCard
        tone="neutral"
        icon="search"
        title={code ? `No units match "${code}"` : 'No unit matches that code'}
        actions={
          <Button variant="secondary" onClick={onRephrase}>
            Rephrase question
          </Button>
        }
      >
        <p>Check the code, or ask by name, for example &quot;machine learning&quot;.</p>
      </StateCard>
    );
  }
  const closest = result.citations.length > 0;
  return (
    <StateCard
      tone="neutral"
      icon="search"
      title="Found something related, but not an answer"
      actions={
        <Button variant="secondary" onClick={onRephrase}>
          Rephrase question
        </Button>
      }
    >
      <p>
        {closest ? (
          <>
            I found a passage on a nearby topic, but it doesn&apos;t answer your question. Here is the closest one{' '}
            <button type="button" className="cite-ref" aria-label="Source 1" onClick={() => onCite(1)}>
              [1]
            </button>
            .
          </>
        ) : (
          "I found passages on nearby topics, but none close enough to answer your question, so I won't guess."
        )}
      </p>
    </StateCard>
  );
}

// Figma: Clarifying question. The student picks one unit, then confirms.
function Clarify({ result, unitNote, onChoose, onAnother, answered }) {
  const [pick, setPick] = useState(result.options[0]?.code);
  return (
    <fieldset className="clarify" disabled={answered}>
      <legend className="clarify__q">{result.answer}</legend>
      <div className="clarify__options">
        {result.options.map((o) => (
          <label key={o.code} className="option">
            <input
              type="radio"
              name={`clarify-${result.id}`}
              value={o.code}
              checked={pick === o.code}
              onChange={() => setPick(o.code)}
            />
            <span className="option__text">
              <span className="option__title">
                <UnitCode code={o.code} />
                <span>{o.name}</span>
              </span>
              <span className="option__note">{unitNote(o)}</span>
            </span>
          </label>
        ))}
      </div>
      {!answered && (
        <div className="clarify__confirm">
          <span className="t-small c-secondary">Is this the unit you meant?</span>
          <Button variant="secondary" onClick={() => onChoose(result.options.find((o) => o.code === pick))}>
            Yes
          </Button>
          <Button variant="ghost" onClick={onAnother}>
            No, another unit
          </Button>
        </div>
      )}
    </fieldset>
  );
}

// Figma: "From the unit outline" excerpts, for sources that come with a table from the page.
function Excerpts({ citations, onCite }) {
  const list = citations.map((c, i) => [c, i + 1]).filter(([c]) => c.table);
  if (!list.length) return null;
  return (
    <section className="excerpts">
      <h4 className="t-h3">From the unit outline</h4>
      <p className="t-caption c-muted">Excerpts the answer used, with the matching part highlighted.</p>
      <div className="excerpts__grid">
        {list.map(([c, n]) => (
          <figure key={n} className="excerpt">
            <div className="excerpt__page">
              <p className="excerpt__top">
                <span>{c.doc}</span>
                {c.page != null && <span>Page {c.page}</span>}
              </p>
              <p className="excerpt__section">{c.section}</p>
              <table>
                <thead>
                  <tr>
                    {c.table.head.map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.table.rows.map((r, ri) => (
                    <tr key={ri} className={c.table.highlight?.includes(ri) ? 'is-hl' : undefined}>
                      {r.map((cell, ci) => (
                        <td key={ci}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <figcaption className="excerpt__cap">
              <Cite n={n} onOpen={onCite} />
              <span>
                {c.section}
                {c.page != null && `, page ${c.page}`}
              </span>
              {c.url && (
                <a className="source__link" href={c.url} target="_blank" rel="noreferrer">
                  Open page<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function AssistantMessage({
  msg,
  scope,
  activeCite,
  onCite,
  onRetry,
  onRephrase,
  onChoose,
  onAnother,
  unitStatus,
  unitNote,
  answered,
  onOpenSources,
}) {
  const [helpful, setHelpful] = useState(false);
  const [copied, setCopied] = useState(false);

  if (msg.status === 'pending') return <Pending scope={msg.scope ?? scope} />;
  if (msg.status === 'error') return <ServiceError error={msg.error} onRetry={onRetry} />;

  const r = msg.result;
  if (r.needs_clarification)
    return (
      <Clarify
        result={{ ...r, id: msg.id }}
        unitNote={unitNote}
        onChoose={onChoose}
        onAnother={onAnother}
        answered={answered}
      />
    );
  if (r.abstained)
    return <Abstained result={{ ...r, question: msg.question }} onRephrase={onRephrase} onCite={onCite} />;

  const focus = msg.question.match(/[A-Za-z]{3}\d{5}/)?.[0]?.toUpperCase();
  const mapCite = r.citations.findIndex((c) => /requisite/i.test(c.section ?? '')) + 1 || null;
  const usesPlan = (msg.scope ?? scope).includes('plan');

  return (
    <div className="answer">
      <Steps result={r} scope={msg.scope ?? scope} />
      <MarkdownContent
        text={r.answer}
        onCite={onCite}
        activeCite={activeCite}
        unitStatus={unitStatus}
        focus={focus}
        mapCite={mapCite}
      />
      <Excerpts citations={r.citations} onCite={onCite} />
      {r.citations.length > 0 && (
        <button type="button" className="sources-row show-narrow" onClick={onOpenSources}>
          <Icon name="file" size={16} className="c-source" />
          <span className="t-label">
            {r.citations.length} source{r.citations.length === 1 ? '' : 's'}
          </span>
          <span className="t-small c-muted">Tap to open</span>
          <Icon name="chevronRight" size={16} className="c-muted" />
        </button>
      )}
      <div className="answer__actions">
        {usesPlan && (
          <>
            <Button variant="secondary" as="a" href="#plan">
              Open my plan
            </Button>
            <Button
              variant="ghost"
              className="hide-mobile"
              onClick={() => {
                window.location.hash = '#plan';
                setTimeout(() => document.getElementById('roadmap')?.scrollIntoView({ block: 'start' }), 120);
              }}
            >
              Show full roadmap
            </Button>
          </>
        )}
        <span className="answer__spacer" />
        <IconButton
          label={copied ? 'Copied' : 'Copy answer'}
          onClick={() =>
            navigator.clipboard?.writeText(r.answer).then(
              () => setCopied(true),
              () => {}
            )
          }
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} />
        </IconButton>
        <IconButton
          label="Helpful"
          aria-pressed={helpful}
          className={helpful ? 'is-on' : ''}
          onClick={() => setHelpful((v) => !v)}
        >
          <Icon name="thumb" size={16} />
        </IconButton>
        <IconButton label="Regenerate" onClick={onRetry}>
          <Icon name="refresh" size={16} />
        </IconButton>
      </div>
    </div>
  );
}
