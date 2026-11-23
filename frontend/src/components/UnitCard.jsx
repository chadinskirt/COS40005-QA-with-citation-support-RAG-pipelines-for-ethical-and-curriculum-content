import Icon from './Icon.jsx';

// Figma: UnitCard (Status, Rank)
export default function UnitCard({ status = 'planned', code, name, note, rank, badge, category }) {
  const color = { planned: 'c-brand', completed: 'c-success', blocked: 'c-danger', retake: 'c-warning' }[status] || 'c-brand';
  return (
    <div className={`unit-card unit-card--${status}`}>
      <div className="unit-card__head">
        <div className="row gap-1">
          <span className={`t-caption ${color}`}>{code}</span>
          {category && (
            <span className={`cat-pill cat-pill--${category} t-caption`}>
              {category === 'core' ? 'Core' : 'Major'}
            </span>
          )}
        </div>
        <div className="row gap-1">
          {badge && <span className="retake-badge t-caption">{badge}</span>}
          {rank != null && (
            <span className="rank-badge t-caption" aria-label={`Rank ${rank} in this semester`}>
              #{rank}
            </span>
          )}
        </div>
      </div>
      <span className="t-body-strong">{name}</span>
      {note && (
        <span className={`row gap-1 t-caption ${status === 'planned' ? 'c-secondary' : color}`}>
          {(status === 'blocked' || status === 'retake') && <Icon name="alert" size={14} />}
          {status === 'completed' && <Icon name="circleCheck" size={14} />}
          {note}
        </span>
      )}
    </div>
  );
}
