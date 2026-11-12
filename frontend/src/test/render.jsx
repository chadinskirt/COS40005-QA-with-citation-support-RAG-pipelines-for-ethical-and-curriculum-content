import { render } from '@testing-library/react';
import { AppStateProvider } from '../state/AppState.jsx';

// Renders a page inside the app state provider.
export const renderWithState = (ui) => render(<AppStateProvider>{ui}</AppStateProvider>);
