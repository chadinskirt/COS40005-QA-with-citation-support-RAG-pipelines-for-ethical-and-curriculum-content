import Icon from './Icon.jsx';

// Figma: Banner (Tone). Warning = abstention, danger = failure.
const TONE = {
  success: { icon: 'circleCheck', color: 'c-success' },
  warning: { icon: 'alert', color: 'c-warning' },
  danger: { icon: 'x', color: 'c-danger' },
  info: { icon: 'info', color: 'c-brand' },
};

export default function Banner({ tone = 'info', title, children }) {
  const t = TONE[tone];
  return (
    <div className={`banner banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className={t.color}>
        <Icon name={t.icon} />
      </span>
      <div className="stack gap-1">
        <p className={`t-label ${t.color}`}>{title}</p>
        {children && <div className="t-small">{children}</div>}
      </div>
    </div>
  );
}
