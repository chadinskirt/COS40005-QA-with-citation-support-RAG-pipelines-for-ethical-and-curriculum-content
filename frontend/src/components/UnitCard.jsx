import Icon from './Icon.jsx';

// Figma: UnitCard (Status, Rank)
export default function UnitCard({ status = 'planned', code, name, note, rank }) {
  const color = { planned: 'c-brand', completed: 'c-success', blocked: 'c-danger' }[status];
  return (
    <div className={`unit-card unit-card--${status}`}>
      <div className="unit-card__head">
        <span className={`t-caption ${color}`}>{code}</span>
        {rank != null && (
          <span className="rank-badge t-caption" aria-label={`Rank ${rank} in this semester`}>
            #{rank}
          </span>
        )}
      </div>
      <span className="t-body-strong">{name}</span>
      {note && (
        <span className={`row gap-1 t-caption ${status === 'planned' ? 'c-secondary' : color}`}>
          {status === 'blocked' && <Icon name="alert" size={14} />}
          {status === 'completed' && <Icon name="circleCheck" size={14} />}
          {note}
        </span>
      )}
    </div>
  );
}
