import Banner from './Banner.jsx';
import Button from './Button.jsx';
import Icon from './Icon.jsx';
import MarkdownContent from './MarkdownContent.jsx';
import { CitationChip } from './Chips.jsx';
import { SystemError } from './States.jsx';
import { ADVISOR_URL } from '../config.js';

const ABSTAIN_COPY = {
  OUT_OF_SCOPE:
    "No syllabus section matched your question closely enough, so I won't guess. This topic is outside what this portal covers.",
  LOW_SIMILARITY: "No syllabus section matched your question closely enough, so I won't guess.",
};

// One assistant turn: pending, failed, abstained (Figma S4) or answered with citations (S3).
export default function AssistantMessage({ msg, selected, onSelect, onRetry, onRephrase }) {
  let body;
  if (msg.status === 'pending') {
    body = (
      <div className="stack gap-3">
        <p className="t-body c-secondary">
          Searching approved documents
          <span className="dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </p>
        <div className="stack gap-2" aria-hidden="true">
          <div className="skeleton skeleton-line skeleton-line--long" />
          <div className="skeleton skeleton-line skeleton-line--medium" />
          <div className="skeleton skeleton-line skeleton-line--short" />
        </div>
      </div>
    );
  } else if (msg.status === 'error') {
    body = <SystemError error={msg.error} onRetry={onRetry} />;
  } else if (msg.result.abstained) {
    body = (
      <>
        <Banner tone="warning" title="I can't answer this from the approved documents">
          {ABSTAIN_COPY[msg.result.abstain_reason] || ABSTAIN_COPY.LOW_SIMILARITY}
        </Banner>
        <div className="row wrap gap-3">
          <Button variant="warning" as="a" href={ADVISOR_URL}>
            Contact an academic advisor
          </Button>
          <Button variant="secondary" onClick={onRephrase}>
            Rephrase question
          </Button>
        </div>
        <p className="t-caption c-secondary">The portal answers only when an approved document supports the answer.</p>
      </>
    );
  } else {
    const { answer, citations } = msg.result;
    body = (
      <>
        <MarkdownContent text={answer} />
        <div className="row wrap gap-2">
          {citations.map((c, i) => (
            <CitationChip
              key={c.id}
              citation={c}
              index={i + 1}
              selected={selected?.msgId === msg.id && selected.citation.id === c.id}
              onSelect={() => onSelect(c, i + 1)}
            />
          ))}
        </div>
        <p className="grounded-badge row gap-1 t-caption c-success">
          <Icon name="circleCheck" size={14} />
          Grounded in {citations.length} approved {citations.length === 1 ? 'document' : 'documents'}
        </p>
      </>
    );
  }

  return (
    <div className="msg-assistant">
      <span className="avatar" aria-hidden="true">
        A
      </span>
      <div className="msg-assistant__body">{body}</div>
    </div>
  );
}
