import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import { Cite } from './Badge.jsx';

// "Jan 2026 · p.2 · Requisites"
export const sourceMeta = (c) => [c.date, c.page != null ? `p.${c.page}` : null, c.section].filter(Boolean).join(' · ');

// Figma: SourceCard, collapsed and expanded. The expanded card shows the quoted passage and a link to the page.
export function SourceCard({ citation: c, n, open, onToggle, onViewPdf }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [open]);
  const id = `source-${n}`;
  const canOpen = Boolean(c.quote || c.url);
  return (
    <li ref={ref} className={`source${open ? ' source--open' : ''}`}>
      <button
        type="button"
        className="source__head"
        aria-expanded={canOpen ? open : undefined}
        aria-controls={canOpen ? id : undefined}
        onClick={() => canOpen && onToggle(n)}
        disabled={!canOpen}
      >
        <Cite n={n} />
        <span className="source__text">
          <span className="source__title" title={c.doc}>
            {c.doc}
          </span>
          {sourceMeta(c) && <span className="source__meta">{sourceMeta(c)}</span>}
        </span>
        {canOpen && <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} className="source__chev" />}
      </button>
      {open && canOpen && (
        <div id={id} className="source__body">
          {c.quote && <blockquote className="quote">&quot;{c.quote}&quot;</blockquote>}
          <div className="source__actions">
            {onViewPdf && (
              <button type="button" className="btn btn--secondary btn--s" onClick={() => onViewPdf(n)}>
                <Icon name="file" size={14} />
                View PDF
              </button>
            )}
            {c.url && (
              <a className="source__link" href={c.url} target="_blank" rel="noreferrer">
                {c.page != null ? `Open at page ${c.page}` : 'Open the document'}
                <Icon name="external" size={13} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function SourcesPanel({ citations, open, onToggle, onViewPdf, heading = true }) {
  return (
    <div className="sources">
      {heading && (
        <div className="sources__head">
          <h2 className="t-h3">Sources</h2>
          {citations.length > 0 && (
            <span className="t-caption c-muted">
              {citations.length} source{citations.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}
      {citations.length ? (
        <ol className="sources__list">
          {citations.map((c, i) => (
            <SourceCard
              key={i}
              citation={c}
              n={i + 1}
              open={open === i + 1}
              onToggle={onToggle}
              onViewPdf={onViewPdf}
            />
          ))}
        </ol>
      ) : (
        <p className="t-small c-secondary">When an answer cites the outlines, its sources appear here.</p>
      )}
      <p className="sources__note">
        <Icon name="shield" size={14} className="c-pass" />
        Each answer links to the source it came from.
      </p>
    </div>
  );
}
