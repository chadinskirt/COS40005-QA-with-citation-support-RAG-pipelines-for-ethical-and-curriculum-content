// Figma: Button (Variant × Size). size "s" is 32px tall, "m" is 36px.
export default function Button({
  variant = 'primary',
  size = 's',
  as: Tag = 'button',
  children,
  className = '',
  ...rest
}) {
  const props = Tag === 'button' ? { type: 'button', ...rest } : rest;
  return (
    <Tag className={`btn btn--${variant} btn--${size} ${className}`} {...props}>
      {children}
    </Tag>
  );
}

// Figma: IconButton. 32×32 hit area; the label doubles as the tooltip.
export function IconButton({ label, children, className = '', ...rest }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}
