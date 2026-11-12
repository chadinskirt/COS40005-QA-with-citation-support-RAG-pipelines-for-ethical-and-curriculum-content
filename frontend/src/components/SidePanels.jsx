import Button from './Button.jsx';
import Icon from './Icon.jsx';
import { citationSource } from './Chips.jsx';

export function SourcesHint() {
  return (
    <div className="card">
      <h2 className="t-h2">Sources</h2>
      <p className="t-small c-secondary">Select a source chip under an answer to read the passage it came from.</p>
    </div>
  );
}

// selected: { citation, index, threshold }
export function SourcePanel({ selected: { citation, index, threshold } }) {
  return (
    <div className="card card--compact">
      <h2 className="t-h2">Source [{index}]</h2>
      <p className="t-caption c-secondary">{citationSource(citation)}</p>
      <blockquote className="passage">
        <p className="t-small">{citation.snippet}</p>
      </blockquote>
      {citation.similarity != null && (
        <p className="row gap-2 t-caption c-success">
          <Icon name="gauge" size={16} />
          Similarity {citation.similarity.toFixed(2)}
          {threshold != null && ` · above threshold ${threshold.toFixed(2)}`}
        </p>
      )}
      <div>
        {citation.url ? (
          <Button variant="secondary" as="a" href={citation.url} target="_blank" rel="noreferrer">
            Open full document
          </Button>
        ) : (
          <Button variant="secondary" disabled>
            Open full document
          </Button>
        )}
      </div>
    </div>
  );
}

const score = (n) => n?.toFixed(2) ?? '–';

export function WhyNoAnswer({ result }) {
  return (
    <div className="card card--compact">
      <h2 className="t-h2">Why no answer?</h2>
      <div className="kv">
        <span className="t-small c-secondary">Top similarity</span>
        <span className="t-label">{score(result.top_similarity)}</span>
      </div>
      <div className="kv">
        <span className="t-small c-secondary">Threshold</span>
        <span className="t-label">{score(result.threshold)}</span>
      </div>
      <div className="kv">
        <span className="t-small c-secondary">Sources passing gate</span>
        <span className="t-label">
          {result.sources_passed} of {result.sources_checked}
        </span>
      </div>
      {result.abstain_reason === 'OUT_OF_SCOPE' && <p className="t-caption c-warning">Out-of-scope topic detected.</p>}
    </div>
  );
}
