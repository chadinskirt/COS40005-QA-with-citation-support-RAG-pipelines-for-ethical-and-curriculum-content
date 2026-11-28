import { useEffect, useId, useRef } from 'react';
import Icon from './Icon.jsx';
import { IconButton } from './Button.jsx';

// Modal behaviour for a panel: focus moves in on open and back on close, Escape closes, Tab stays inside.
// Runs once per opening, so callers may pass an inline onClose.
export function useModal(panel, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    const el = panel.current;
    (el.querySelector('[data-autofocus]') ?? el).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab') return;
      const items = [
        ...el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ].filter((n) => !n.disabled);
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Modal dialog (Figma: Dialog).
export default function Dialog({ title, description, onClose, children, footer, wide }) {
  const panel = useRef(null);
  const titleId = useId();
  const descId = useId();
  useModal(panel, onClose);

  return (
    <div className="dialog-layer">
      <div className="scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        className={`dialog${wide ? ' dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
<<<<<<< Updated upstream
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
=======
>>>>>>> Stashed changes
      >
        <div className="dialog__head">
          <div>
            <h2 id={titleId} className="t-h3">
              {title}
            </h2>
            {description && (
              <p id={descId} className="t-small c-secondary">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </IconButton>
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}
