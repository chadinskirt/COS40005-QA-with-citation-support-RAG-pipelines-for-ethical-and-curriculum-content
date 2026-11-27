import Icon from './Icon.jsx';

// Figma: Badge (Tone). Colour always comes with a word; Retake also carries an icon.
export default function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`badge badge--${tone}`}>
      {tone === 'retake' && <Icon name="refresh" size={12} />}
      {children ?? (tone === 'retake' ? 'Retake' : null)}
    </span>
  );
}

// Figma: UnitCode
export const UnitCode = ({ code }) => <span className="unit-code">{code}</span>;

// Figma: Cite. 18px marker inside a 24×24 hit area; opens the matching source.
export function Cite({ n, onOpen, active }) {
  if (!onOpen) {
    return (
      <span className="cite" aria-hidden="true">
        <span className="cite__marker">{n}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="cite"
      aria-label={`Source ${n}`}
      aria-pressed={Boolean(active)}
      onClick={() => onOpen(n)}
    >
      <span className="cite__marker">{n}</span>
    </button>
  );
}

const CATEGORY = { core: 'Core', major: 'Major', elective: 'Elective' };
export const categoryLabel = (c) => CATEGORY[c] ?? 'Elective';
