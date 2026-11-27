import { useState } from 'react';
import { API_BASE } from '../config.js';
import Icon from './Icon.jsx';
import MarkdownContent from './MarkdownContent.jsx';
const citationSource = (c) =>
  [c?.source_file || c?.doc, c?.page_number != null ? `p.${c.page_number}` : c?.page != null ? `p.${c.page}` : null, c?.section]
    .filter(Boolean)
    .join(' · ');

function resolveDocumentUrl(documentUrl) {
  if (!documentUrl) return null;
  if (/^https?:\/\//i.test(documentUrl)) return documentUrl;
  const baseOrigin = API_BASE.replace(/\/api\/?$/, '');
  return `${baseOrigin}${documentUrl.startsWith('/') ? '' : '/'}${documentUrl}`;
}

export default function DocumentViewerDrawer({
  citation,
  index,
  citations = [],
  threshold,
  onSelectCitation,
  onClose,
}) {
  const [excerptOpen, setExcerptOpen] = useState(true);

  if (!citation) return null;

  const sim = citation.similarity ?? citation.similarity_score;
  const excerpt = citation.content || citation.snippet || citation.text_snippet || citation.quote || '';
  const resolvedUrl = resolveDocumentUrl(citation.document_url || citation.url);
  const isPdf = Boolean(resolvedUrl && /\.pdf(?:$|[?#])/i.test(resolvedUrl));
  const pdfHash = isPdf
    ? `#toolbar=1&navpanes=0${citation.page_number != null ? `&page=${citation.page_number}` : ''}`
    : '';
  const iframeSrc = isPdf ? `${resolvedUrl}${pdfHash}` : null;
  const total = citations.length || 1;
  const hasPrev = index > 1 && citations[index - 2];
  const hasNext = index < total && citations[index];

  return (
    <div className="card card--compact card--selected doc-viewer" data-selected-citation={index}>
      <div className="doc-viewer__header">
        <div className="row wrap gap-2">
          {citation.unit_code && <span className="cat-pill cat-pill--core t-caption t-mono">{citation.unit_code}</span>}
          {citation.section && <span className="cat-pill cat-pill--major t-caption">{citation.section}</span>}
          <span className="t-caption c-secondary doc-viewer__filename" title={citationSource(citation)}>
            {citation.source_file || citation.doc || 'Source Document'}
          </span>
        </div>

        <div className="row gap-2">
          {total > 1 && onSelectCitation && (
            <div className="row gap-1" role="group" aria-label="Citation switcher">
              <button
                type="button"
                className="doc-viewer__nav"
                disabled={!hasPrev}
                onClick={() => hasPrev && onSelectCitation(citations[index - 2], index - 1)}
                aria-label="Previous citation"
              >
                <Icon name="chevronLeft" size={16} />
                Prev
              </button>
              <span className="t-caption t-mono c-secondary">
                {index} of {total}
              </span>
              <button
                type="button"
                className="doc-viewer__nav"
                disabled={!hasNext}
                onClick={() => hasNext && onSelectCitation(citations[index], index + 1)}
                aria-label="Next citation"
              >
                Next
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          )}
          {resolvedUrl && (
            <a
              className="doc-viewer__ext t-caption"
              href={resolvedUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open in New Tab
            </a>
          )}
          {onClose && (
            <button
              type="button"
              className="doc-viewer__close"
              onClick={onClose}
              aria-label="Close document viewer"
              title="Close document viewer"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="doc-viewer__excerpt">
        <div className="row between gap-2">
          <div className="row gap-2">
            <span className="t-label">Source [{index}] Excerpt</span>
            {sim != null && (
              <span className="source-sim-badge row gap-1 t-caption t-mono c-success">
                <Icon name="gauge" size={16} />
                {sim.toFixed(2)}
                {threshold != null && ` / ${threshold.toFixed(2)}`}
              </span>
            )}
          </div>
          <button
            type="button"
            className="mermaid-toggle t-caption"
            onClick={() => setExcerptOpen((v) => !v)}
          >
            {excerptOpen ? 'Hide excerpt' : 'Show excerpt'}
          </button>
        </div>
        {excerptOpen && (
          <blockquote className="passage">
            <div className="passage-excerpt">
              <MarkdownContent text={excerpt} />
            </div>
          </blockquote>
        )}
      </div>

      <div className="doc-viewer__body">
        {isPdf ? (
          <iframe
            className="doc-viewer__frame"
            src={iframeSrc}
            title={citation.source_file || citation.doc || `Source ${index}`}
          />
        ) : (
          <div className="doc-viewer__text">
            {citation.unit_name && (
              <p className="t-label c-brand">
                {citation.unit_code} · {citation.unit_name}
              </p>
            )}
            <MarkdownContent text={excerpt} />
          </div>
        )}
      </div>
    </div>
  );
}
