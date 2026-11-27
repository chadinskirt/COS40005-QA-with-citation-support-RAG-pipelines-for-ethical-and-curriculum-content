import { useEffect, useState } from 'react';
import Shell from './components/Shell.jsx';
import HomePage from './pages/HomePage.jsx';
import PlanPage from './pages/PlanPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import LaterPage from './pages/LaterPage.jsx';
import { ALIASES, APP_TITLE, ROUTES } from './routes.js';

const PAGES = { home: HomePage, plan: PlanPage, ask: ChatPage };
const current = () => {
  const hash = window.location.hash.slice(1);
  const id = ALIASES[hash] ?? hash;
  return ROUTES.some((r) => r.id === id) ? id : 'home';
};

export default function App() {
  const [page, setPage] = useState(current);

  useEffect(() => {
    const onHash = () => {
      setPage(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The hash router never reloads the page, so keep the tab title in step.
  const route = ROUTES.find((r) => r.id === page);
  useEffect(() => {
    document.title = page === 'home' ? APP_TITLE : `${route.label} · ${APP_TITLE}`;
  }, [page, route]);

  const Page = PAGES[page] ?? LaterPage;
  return (
    <Shell page={page}>
      <Page route={route} />
    </Shell>
  );
}
