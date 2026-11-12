import { useEffect, useState } from 'react';
import Shell from './components/Shell.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import { APP_TITLE, ROUTES } from './routes.js';

const COMPONENTS = { profile: ProfilePage, ask: ChatPage };
const current = () => {
  const id = window.location.hash.slice(1);
  return ROUTES.some((r) => r.id === id) ? id : 'profile';
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
  useEffect(() => {
    document.title = `${ROUTES.find((r) => r.id === page).label} · ${APP_TITLE}`;
  }, [page]);

  const Page = COMPONENTS[page];
  return (
    <Shell page={page}>
      <Page />
    </Shell>
  );
}
