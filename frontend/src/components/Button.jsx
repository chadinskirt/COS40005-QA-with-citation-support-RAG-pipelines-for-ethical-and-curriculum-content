// Figma: Button (Type)
export default function Button({ variant = 'primary', as: Tag = 'button', children, className = '', ...rest }) {
  const props = Tag === 'button' ? { type: 'button', ...rest } : rest;
  return (
    <Tag className={`btn btn--${variant} ${className}`} {...props}>
      {children}
    </Tag>
  );
}
