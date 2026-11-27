import { useState } from 'react';
import Badge from './Badge.jsx';
import Button from './Button.jsx';
import Icon from './Icon.jsx';
import { ADVISOR_URL } from '../config.js';

// Figma: System states. A labelled card with an icon tile, a title, a message and next steps.
export function StateCard({ label, tone = 'neutral', icon, title, children, actions, className = '', role }) {
  return (
    <div className={`state-card state-card--${tone} ${className}`} role={role}>
      {label && <Badge tone={tone}>{label}</Badge>}
      {icon && (
        <span className={`icon-tile icon-tile--${tone}`}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <p className="state-card__title">{title}</p>
      {children && <div className="state-card__body">{children}</div>}
      {actions && <div className="row wrap gap-8">{actions}</div>}
    </div>
  );
}

const pad = (n) => String(n).padStart(2, '0');

// A system failure, never an abstention. A 4xx shows the backend's message, since it says what was wrong.
export function ServiceError({ error, onRetry, what = 'Your question' }) {
  const [at] = useState(() => new Date());
  const [copied, setCopied] = useState(false);
  const rejected = error?.status >= 400 && error.status < 500 && Boolean(error.message);
  const id = `svc-${error?.status || 0} · ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const copy = () =>
    navigator.clipboard?.writeText(`${id} ${error?.code ?? ''}`.trim()).then(
      () => setCopied(true),
      () => setCopied(false)
    );
  return (
    <StateCard
      label="Service error"
      tone="danger"
      icon="alert"
      role="alert"
      title={rejected ? 'The service turned this request down' : "We couldn't reach the advising service"}
    >
      <p>
        {rejected ? `${error.message} ` : `${what} wasn't answered. `}
        Your plan and this chat are still here.
      </p>
      <div className="row wrap gap-8">
        {onRetry && (
          <Button variant="primary" size="m" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button variant="ghost" size="m" onClick={copy}>
          {copied ? 'Copied' : 'Copy error ID'}
        </Button>
      </div>
      <p className="error-id">
        <span className="c-muted">Error ID</span> <code>{id}</code>
      </p>
    </StateCard>
  );
}

// A circular prerequisite in the curriculum data: the plan can't be built until the data is fixed.
export function CurriculumError({ error }) {
  const cycle = error?.details?.cycle;
  return (
    <StateCard
      label="Curriculum data error"
      tone="danger"
      icon="alert"
      role="alert"
      title="The course data has a loop, so no plan was made"
      actions={
        <Button variant="secondary" as="a" href={ADVISOR_URL}>
          Contact an advisor
        </Button>
      }
    >
      <p>{cycle ? `These units require each other: ${cycle.join(' → ')}.` : error.message}</p>
    </StateCard>
  );
}
