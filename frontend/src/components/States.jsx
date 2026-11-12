import Banner from './Banner.jsx';
import Button from './Button.jsx';
import { ADVISOR_URL } from '../config.js';

// System failure. Not an abstention. A 4xx shows the backend's own message, since it says what was wrong.
export function SystemError({ error, onRetry }) {
  const rejected = error?.status >= 400 && error.status < 500 && Boolean(error.message);
  let detail = 'The service is not responding. Your entries are still here. Try again in a moment.';
  if (error?.code === 'NETWORK_ERROR') detail = `${error.message} Your entries are still here. Try again in a moment.`;
  else if (rejected) detail = `${error.message} Your entries are still here.`;
  return (
    <div className="stack gap-4">
      <Banner tone="danger" title="Something went wrong on our side">
        {detail}
      </Banner>
      {onRetry && (
        <div>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

// Circular prerequisite in the curriculum data.
export function CurriculumError({ error }) {
  const cycle = error?.details?.cycle;
  return (
    <div className="stack gap-4">
      <Banner tone="danger" title="Curriculum data error">
        {cycle
          ? `A circular prerequisite was found (${cycle.join(' → ')}) in the source data, so no plan was generated.`
          : error.message}
      </Banner>
      <div>
        <Button variant="secondary" as="a" href={ADVISOR_URL}>
          Contact an academic advisor
        </Button>
      </div>
    </div>
  );
}

export function PathwaySkeleton() {
  return (
    <div className="stack gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Checking every prerequisite rule</span>
      <div className="skeleton skeleton-line skeleton-line--short" />
      <div className="skeleton skeleton-line skeleton-line--long" />
      <div className="skeleton skeleton-line skeleton-line--medium" />
      <div className="semesters">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <p className="t-caption c-secondary">Checking every prerequisite rule… usually under 3 seconds.</p>
    </div>
  );
}
