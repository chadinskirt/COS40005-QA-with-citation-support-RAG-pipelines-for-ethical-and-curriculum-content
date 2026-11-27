import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from './api/client.js';
import { AppStateProvider } from './state/AppState.jsx';
import App from './App.jsx';

vi.mock('./api/client.js', async (orig) => ({
  ...(await orig()),
  api: { getUnits: vi.fn(), recommend: vi.fn(), chat: vi.fn(), sharePlan: vi.fn() },
}));

const renderApp = () =>
  render(
    <AppStateProvider>
      <App />
    </AppStateProvider>
  );
// Async act so the page's mocked requests settle inside act.
const goTo = (hash) =>
  act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

beforeEach(() => {
  api.getUnits.mockResolvedValue({
    units: [{ code: 'COS30019', name: 'Introduction to Artificial Intelligence', credit_points: 12.5 }],
  });
  // The empty plan asks the planner for a first semester.
  api.recommend.mockResolvedValue({ semesters: [], blocked_units: [], dag_graph: { edges: [] } });
});
afterEach(() => {
  window.location.hash = '';
  localStorage.clear();
  vi.resetAllMocks();
});

describe('App', () => {
  it('opens Home by default with the sidebar from Figma', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: /Plan your degree/ })).toBeInTheDocument();
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Explore majors', 'Plan semester', 'Unit outlines', 'Ask the assistant']) {
      expect(nav.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Saved on this device only')).toBeInTheDocument();
    expect(document.title).toBe('Academic Advising Portal');
  });

  it('routes by hash, keeps the v1.1 #profile link working and updates the title', async () => {
    renderApp();
    await goTo('#profile');
    expect(screen.getByRole('link', { name: 'Plan semester' })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('Plan semester · Academic Advising Portal');
    await goTo('#outlines');
    expect(screen.getByRole('heading', { name: 'Unit outlines are coming next' })).toBeInTheDocument();
    await goTo('#nope');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('sends a question from Home to the assistant', async () => {
    api.chat.mockResolvedValue({ answer: 'Sure.', citations: [], abstained: false, steps: [], options: [] });
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'How do I pass COS30019?' }));
    expect(await screen.findByText('Sure.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ask the assistant' })).toHaveAttribute('aria-current', 'page');
    expect(api.chat).toHaveBeenCalledWith('How do I pass COS30019?', [], { scope: ['outlines'], plan: null });
  });

  it('keeps the chat when moving away and back', async () => {
    api.chat.mockResolvedValue({
      answer: 'Hello [1]',
      citations: [{ doc: 'D', quote: 'x' }],
      abstained: false,
      options: [],
    });
    const user = userEvent.setup();
    renderApp();
    await goTo('#ask');
    await user.type(screen.getByLabelText('Your question'), 'Hi{Enter}');
    expect(await screen.findByText(/Hello/)).toBeInTheDocument();
    await goTo('#plan');
    await goTo('#ask');
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
    expect(screen.getAllByText('D').length).toBeGreaterThan(0);
  });

  it('searches units with Ctrl K and starts a question about the one picked', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('combobox', { name: 'Search units' })).toHaveFocus();
    await user.keyboard('artificial');
    await user.click(await screen.findByRole('option', { name: /COS30019/ }));
    expect(screen.getByLabelText('Your question')).toHaveValue(
      'Tell me about COS30019 Introduction to Artificial Intelligence'
    );
    await user.type(screen.getByRole('combobox', { name: 'Search units' }), 'COS4099');
    expect(screen.getByText('No units match "COS4099"')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('combobox', { name: 'Search units' })).toHaveValue('');
  });
});
