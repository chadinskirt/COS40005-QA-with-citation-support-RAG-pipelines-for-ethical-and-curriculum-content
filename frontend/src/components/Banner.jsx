import Icon from './Icon.jsx';

// Figma: Callout (Tone). Danger is for failures and broken rules, caution for things that need approval.
const ICON = { info: 'info', success: 'checkCircle', caution: 'alert', danger: 'alert', neutral: 'info' };

export default function Banner({ tone = 'info', title, children, className = '' }) {
  return (
    <div className={`callout callout--${tone} ${className}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={ICON[tone]} size={16} className="callout__icon" />
      <div className="callout__text">
        {title && <p className="callout__title">{title}</p>}
        {children && <div className="callout__body">{children}</div>}
      </div>
    </div>
  );
}
