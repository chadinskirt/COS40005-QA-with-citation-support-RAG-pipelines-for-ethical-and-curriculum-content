import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api, normalizeChat } from '../api/client.js';
import { ApiError } from '../api/errors.js';
import { STORAGE_KEY } from '../state/AppState.jsx';
import { renderWithState } from '../test/render.jsx';
import ChatPage from './ChatPage.jsx';

vi.mock('../api/client.js', async (orig) => ({
  ...(await orig()),
  api: { getUnits: vi.fn(), recommend: vi.fn(), chat: vi.fn() },
}));

const outline = (page, section, quote) => ({
  doc: 'COS30019 Unit Outline',
  outline_date: 'Jan 2026',
  page,
  section,
  quote,
  url: 'https://example.edu/o.pdf',
});
const ANSWER = normalizeChat({
  answer: 'Not yet. It needs COS20007 [1]. Assessment is on page 6 [2].',
  citations: [outline(2, 'Requisites', 'Pre-requisites: COS20007'), outline(6, 'Assessment', 'Assignment 1 20%')],
  abstained: false,
  steps: [{ label: 'Read your plan' }, { label: 'Searched 3 unit outlines' }],
  latency_ms: 2100,
});
const ABSTAIN = (reason, extra = {}) =>
  normalizeChat({ answer: null, citations: [], abstained: true, abstain_reason: reason, ...extra });

const ask = async (user, text) => {
  await user.type(screen.getByLabelText('Your question'), text);
  await user.click(screen.getByRole('button', { name: 'Send question' }));
};

beforeEach(() => {
  api.getUnits.mockResolvedValue({ units: [] });
  api.recommend.mockResolvedValue({
    major: { id: 'x', name: 'X' },
    semesters: [],
    blocked_units: [],
    dag_graph: { edges: [] },
  });
});
afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
});

describe('ChatPage', () => {
  it('answers with steps, numbered sources and a sources panel', async () => {
    api.chat.mockResolvedValue(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Can I take COS30019?');

    expect(await screen.findByText(/Not yet\. It needs COS20007/)).toBeInTheDocument();
    expect(screen.getByText('Searched 3 unit outlines')).toBeInTheDocument();
    expect(screen.getByText('2.1 s')).toBeInTheDocument();
    expect(within(screen.getByRole('complementary', { name: 'Sources' })).getByText('2 sources')).toBeInTheDocument();
    // The first source opens by default; [2] opens the second.
    expect(screen.getByText('"Pre-requisites: COS20007"')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Source 2' }));
    expect(screen.getByText('"Assignment 1 20%"')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open at page 6/ })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Can I take COS30019?');
  });

  it('sends the plan only when the student has one and allows it', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profile: { major: 'x', units: { A: { status: 'passed', grade: 'HD' } } },
        start: '2027-0',
        load: 3,
        swaps: [],
      })
    );
    api.chat.mockResolvedValue(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Q1');
    await screen.findByText(/Not yet/);
    expect(api.chat.mock.calls[0][2]).toMatchObject({
      scope: ['outlines', 'plan'],
      plan: { major: 'x', completed_units: ['A'], start_term: 'January 2027' },
    });
    expect(api.chat.mock.calls[0][2].plan.grades).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Past grades' }));
    await ask(user, 'Q2');
    await waitFor(() => expect(api.chat).toHaveBeenCalledTimes(2));
    expect(api.chat.mock.calls[1][2].plan.grades).toEqual({ A: 'HD' });
    expect(api.chat.mock.calls[1][1]).toHaveLength(2); // history of the first turn

    await user.click(screen.getByRole('button', { name: 'My plan' }));
    await ask(user, 'Q3');
    await waitFor(() => expect(api.chat).toHaveBeenCalledTimes(3));
    expect(api.chat.mock.calls[2][2].plan).toBeFalsy();
  });

  it('shows the out-of-scope card, not an error, and lets the student rephrase', async () => {
    api.chat.mockResolvedValue(ABSTAIN('OUT_OF_SCOPE'));
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Can credits transfer?');
    expect(await screen.findByText("The approved outlines don't cover this")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact an advisor' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rephrase question' }));
    expect(screen.getByLabelText('Your question')).toHaveValue('Can credits transfer?');
  });

  it('shows a weak match with the closest passage', async () => {
    api.chat.mockResolvedValue(ABSTAIN('LOW_SIMILARITY', { citations: [outline(5, 'Assessment', 'Nearby')] }));
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Something vague');
    expect(await screen.findByText('Found something related, but not an answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Source 1' })).toBeInTheDocument();
  });

  it('names an unknown unit code', async () => {
    api.chat.mockResolvedValue(ABSTAIN('UNIT_NOT_FOUND'));
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'What is COS49999?');
    expect(await screen.findByText('No units match "COS49999"')).toBeInTheDocument();
  });

  it('asks which unit is meant and sends the choice', async () => {
    api.chat.mockResolvedValueOnce(
      normalizeChat({
        needs_clarification: true,
        answer: 'Which unit do you mean?',
        options: [
          { code: 'COS30019', name: 'Introduction to Artificial Intelligence' },
          { code: 'COS30018', name: 'Intelligent Systems' },
        ],
        citations: [],
        abstained: false,
      })
    );
    api.chat.mockResolvedValueOnce(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'How do I pass the AI unit?');
    const group = await screen.findByRole('group', { name: 'Which unit do you mean?' });
    await user.click(within(group).getByRole('radio', { name: /COS30018/ }));
    await user.click(within(group).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(api.chat).toHaveBeenCalledTimes(2));
    expect(api.chat.mock.calls[1][0]).toBe('Yes, COS30018 Intelligent Systems');
    expect(await screen.findByText(/Not yet/)).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: 'Yes' })).not.toBeInTheDocument();
  });

  it('shows a service error with an error ID, and retries the same question', async () => {
    api.chat.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'down'));
    api.chat.mockResolvedValueOnce(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Hello');
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach the advising service");
    expect(screen.getByText(/svc-503/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Not yet/)).toBeInTheDocument();
    expect(api.chat).toHaveBeenLastCalledWith('Hello', [], expect.anything());
    expect(screen.getAllByText('Hello', { selector: '.bubble' })).toHaveLength(1);
  });

  it('starts a new chat', async () => {
    api.chat.mockResolvedValue(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Hi');
    await screen.findByText(/Not yet/);
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.queryByText(/Not yet/)).not.toBeInTheDocument();
    expect(screen.getByText('Ask about a unit, a prerequisite or your plan')).toBeInTheDocument();
  });
});
