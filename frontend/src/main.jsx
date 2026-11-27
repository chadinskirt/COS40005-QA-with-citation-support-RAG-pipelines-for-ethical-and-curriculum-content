import React from 'react';
import ReactDOM from 'react-dom/client';
// Type system from Figma v1.2: Inter for UI, Newsreader for titles and quotes, IBM Plex Mono for unit codes.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/newsreader/latin-400.css';
import '@fontsource/newsreader/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/app.css';
import { AppStateProvider } from './state/AppState.jsx';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </React.StrictMode>
);
