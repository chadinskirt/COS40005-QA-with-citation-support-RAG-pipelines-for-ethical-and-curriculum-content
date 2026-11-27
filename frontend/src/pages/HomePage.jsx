import { useState } from 'react';
import Composer from '../components/Composer.jsx';
import Icon from '../components/Icon.jsx';
import { TopBar } from '../components/Shell.jsx';
import { OUTLINE_COUNT } from '../config.js';
import { nextTerm, termLabel } from '../lib/terms.js';
import { useAppState } from '../state/AppState.jsx';

const SUGGESTIONS = [
  'How do I pass COS30019?',
  'Which AI units can I take next semester?',
  'Compare Data Science and AI',
];

const ROLES = [
  {
    icon: 'compass',
    who: 'First-year students',
    title: "I haven't chosen a major",
    body: 'Match what you enjoy and the job you want to a major, along with the units and careers it leads to.',
    short: 'Match your interests and the job you want to a major.',
    meta: 'About 5 minutes',
    cta: 'Explore majors',
    href: '#majors',
  },
  {
    icon: 'calendar',
    who: 'Current students',
    title: "I'm planning next semester",
    body: "Add the units you've passed or need to retake. You get a plan that meets every prerequisite and keeps your graduation date.",
    short: 'Get a plan that meets every prerequisite.',
    meta: "Uses the units you've passed",
    cta: 'Plan my semester',
    href: '#plan',
  },
];

// Figma: Home (desktop and mobile)
export default function HomePage() {
  const { setPendingQuestion } = useAppState();
  const [draft, setDraft] = useState('');

  const ask = (q) => {
    setPendingQuestion(q);
    window.location.hash = '#ask';
  };

  return (
    <>
      <TopBar>Home</TopBar>
      <div className="content content--home">
        <section className="hero" aria-labelledby="hero-title">
          <p className="pill">
            <span className="dot dot--pass" aria-hidden="true" />
            Planning for {termLabel(nextTerm())} is open
          </p>
          <h1 id="hero-title" className="t-display">
            Plan your degree and check every answer against the official outline.
          </h1>
          <p className="hero__lead">
            Explore majors, build a semester plan that meets every prerequisite, and ask about any unit. Each answer
            links to the source it came from.
          </p>
          <Composer
            variant="home"
            label="Ask about a unit, a prerequisite or your plan"
            placeholder="Ask about a unit, a prerequisite or your plan"
            value={draft}
            onChange={setDraft}
            onSubmit={ask}
          >
            {SUGGESTIONS.map((s, i) => (
              <button key={s} type="button" className={`chip${i === 1 ? ' hide-mobile' : ''}`} onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </Composer>
          <p className="meta-line">
            <Icon name="file" size={14} className="c-source" />
            Answers cite {OUTLINE_COUNT} official unit outlines. If the outlines don&apos;t cover a question, the
            assistant says so.
          </p>
        </section>

        <section className="stack gap-16" aria-labelledby="roles-title">
          <h2 id="roles-title" className="t-h2">
            Where are you in your degree?
          </h2>
          <div className="role-grid">
            {ROLES.map((r) => (
              <article key={r.href} className="card role-card">
                <div className="role-card__top">
                  <span className="icon-tile">
                    <Icon name={r.icon} size={18} />
                  </span>
                  <span className="t-caption c-muted hide-mobile">{r.who}</span>
                </div>
                <div className="role-card__text">
                  <h3 className="t-h3">{r.title}</h3>
                  <p className="t-small c-secondary hide-mobile">{r.body}</p>
                  <p className="t-small c-secondary show-mobile">{r.short}</p>
                </div>
                <div className="role-card__foot">
                  <span className="t-caption c-muted hide-mobile">{r.meta}</span>
                  <a className="btn btn--ghost btn--s role-card__cta" href={r.href}>
                    {r.cta}
                    <Icon name="arrowRight" size={16} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
