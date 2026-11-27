import { forwardRef, useLayoutEffect, useRef } from 'react';
import Icon from './Icon.jsx';

// Figma: Composer. Enter sends, Shift+Enter adds a line. `home` puts the send button beside the text.
const Composer = forwardRef(function Composer(
  { value, onChange, onSubmit, placeholder, disabled, label = 'Your question', variant = 'chat', children },
  ref
) {
  const own = useRef(null);
  const area = ref ?? own;

  // Grow with the text, up to the CSS max-height.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, area]);

  const send = (
    <button type="submit" className="send-btn" disabled={disabled} aria-label="Send question">
      <Icon name="arrowUp" size={variant === 'home' ? 17 : 16} strokeWidth={2} />
    </button>
  );

  return (
    <form
      className={`composer composer--${variant}`}
      onSubmit={(e) => {
        e.preventDefault();
        // An empty send just puts the cursor in the box.
        if (disabled) return;
        if (value.trim()) onSubmit(value.trim());
        else area.current?.focus();
      }}
    >
      <div className="composer__row">
        <label className="composer__label">
          <span className="sr-only">{label}</span>
          <textarea
            ref={area}
            rows={1}
            maxLength={500}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form.requestSubmit();
              }
            }}
          />
        </label>
        {variant === 'home' && send}
      </div>
      <div className="composer__controls">
        <div className="composer__chips">{children}</div>
        {variant !== 'home' && send}
      </div>
    </form>
  );
});

export default Composer;
