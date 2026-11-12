import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { api } from './api/client.js';
import { AppStateProvider } from './state/AppState.jsx';
import App from './App.jsx';
import { version } from '../package.json';

vi.mock('./api/client.js', () => ({
  api: { getMajors: vi.fn(), getUnits: vi.fn(), recommend: vi.fn(), chat: vi.fn() },
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
  api.getMajors.mockResolvedValue({ majors: [{ id: 'ai', name: 'Artificial Intelligence' }] });
  api.getUnits.mockResolvedValue({ units: [] });
});
afterEach(() => {
  window.location.hash = '';
});

describe('App routing', () => {
  it('opens the study profile by default and marks it as the current page', async () => {
    renderApp();
    expect(await screen.findByText('Your study profile')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Study profile' })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('Study profile · Academic Advising Portal');
  });

  it('switches to the chat page and updates the title', async () => {
    renderApp();
    await goTo('#ask');
    expect(screen.getByText('Ask anything about your units')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ask the syllabus' })).toHaveAttribute('aria-current', 'page');
    expect(document.title).toBe('Ask the syllabus · Academic Advising Portal');
  });

  it.each(['#nope', '#constructor', '#toString', '#main'])('falls back to the profile for %s', async (hash) => {
    window.location.hash = hash;
    renderApp();
    expect(await screen.findByText('Your study profile')).toBeInTheDocument();
  });

  it('shows the package version in the sidebar', async () => {
    renderApp();
    expect(await screen.findByText(`v${version}`)).toBeInTheDocument();
  });

  it('keeps the chat thread when moving away and back', async () => {
    api.chat.mockResolvedValue({
      answer: 'Hello [1]',
      citations: [{ id: 'c1', doc: 'D', section: 'S', page: 1, snippet: 'x', similarity: 0.9, url: null }],
      abstained: false,
      abstain_reason: null,
      top_similarity: 0.9,
      threshold: 0.7,
      sources_checked: 1,
      sources_passed: 1,
    });
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderApp();
    await goTo('#ask');
    await user.type(screen.getByLabelText('Your question'), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Send question' }));
    await screen.findByText('Hello [1]');
    await goTo('#profile');
    await goTo('#ask');
    expect(screen.getByText('Hello [1]')).toBeInTheDocument();
    expect(screen.getByText('Source [1]')).toBeInTheDocument();
  });
});
