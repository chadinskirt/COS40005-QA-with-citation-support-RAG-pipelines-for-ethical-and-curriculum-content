import Icon from '../components/Icon.jsx';
import { TopBar } from '../components/Shell.jsx';

// Explore majors and Unit outlines are designed in Figma v1.2 but scheduled for a later version.
const COPY = {
  majors: {
    title: 'Explore majors is coming next',
    body: 'Matching your interests to a major needs a new backend endpoint. Until then, the assistant can compare majors for you.',
  },
  outlines: {
    title: 'Unit outlines are coming next',
    body: 'Until then, ask the assistant about any unit. It answers from the same approved outlines and shows the page it used.',
  },
};

export default function LaterPage({ route }) {
  const copy = COPY[route.id];
  return (
    <>
      <TopBar>{route.label}</TopBar>
      <div className="content content--narrow">
        <div className="card state-card">
          <span className="icon-tile">
            <Icon name={route.icon} size={16} />
          </span>
          <h1 className="t-h3">{copy.title}</h1>
          <p className="t-small c-secondary">{copy.body}</p>
          <div className="row wrap gap-8">
            <a className="btn btn--primary btn--s" href="#ask">
              Ask the assistant
            </a>
            <a className="btn btn--ghost btn--s" href="#plan">
              Plan semester
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
