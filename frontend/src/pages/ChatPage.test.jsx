import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api/client.js';
import { ApiError } from '../api/errors.js';
import { renderWithState } from '../test/render.jsx';
import ChatPage from './ChatPage.jsx';

vi.mock('../api/client.js', () => ({
  api: { getMajors: vi.fn(), getUnits: vi.fn(), recommend: vi.fn(), chat: vi.fn() },
}));

const cite = (id, section, similarity) => ({
  id,
  doc: 'COS30019 Unit Outline',
  section,
  page: 6,
  snippet: `Passage ${id}`,
  similarity,
  url: 'https://example.edu/doc.pdf',
});
const ANSWER = {
  answer: 'You need 50% overall [1]. Prerequisites are listed [2].',
  citations: [cite('c1', '§4 Assessment', 0.86), cite('c2', '§1 Unit details', 0.83)],
  abstained: false,
  abstain_reason: null,
  top_similarity: 0.86,
  threshold: 0.7,
  sources_checked: 5,
  sources_passed: 2,
};
const ABSTAINED = {
  answer: null,
  citations: [],
  abstained: true,
  abstain_reason: 'OUT_OF_SCOPE',
  top_similarity: 0.41,
  threshold: 0.7,
  sources_checked: 5,
  sources_passed: 0,
};

const ask = async (user, text) => {
  await user.type(screen.getByLabelText('Your question'), text);
  await user.click(screen.getByRole('button', { name: 'Send question' }));
};

beforeEach(() => vi.resetAllMocks());

describe('ChatPage', () => {
  it('shows the empty state and sends a suggestion when clicked', async () => {
    api.chat.mockResolvedValue(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    expect(screen.getByText('Ask anything about your units')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'How is COS20007 assessed?' }));
    expect(api.chat).toHaveBeenCalledWith('How is COS20007 assessed?', []);
  });

  it('shows the answer with its citations and opens the first source', async () => {
    api.chat.mockResolvedValue(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'What do I need to pass?');
    expect(await screen.findByText(/You need 50% overall/)).toBeInTheDocument();
    expect(screen.getByText('Grounded in 2 approved documents')).toBeInTheDocument();
    expect(screen.getByText('Source [1]')).toBeInTheDocument();
    expect(screen.getByText('Passage c1')).toBeInTheDocument();
    expect(screen.getByText('Similarity 0.86 · above threshold 0.70')).toBeInTheDocument();
  });

  it('switches the side panel when another citation is selected', async () => {
    api.chat.mockResolvedValue(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Q');
    await user.click(await screen.findByRole('button', { name: /Source 2/ }));
    expect(screen.getByText('Source [2]')).toBeInTheDocument();
    expect(screen.getByText('Passage c2')).toBeInTheDocument();
  });

  it('shows an abstention with the reason panel, not a system error', async () => {
    api.chat.mockResolvedValue(ABSTAINED);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Can credits transfer?');
    expect(await screen.findByText("I can't answer this from the approved documents")).toBeInTheDocument();
    expect(screen.getByText('Why no answer?')).toBeInTheDocument();
    expect(screen.getByText('0 of 5')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong on our side')).not.toBeInTheDocument();
  });

  it('puts the question back in the input on Rephrase', async () => {
    api.chat.mockResolvedValue(ABSTAINED);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Can credits transfer?');
    await user.click(await screen.findByRole('button', { name: 'Rephrase question' }));
    expect(screen.getByLabelText('Your question')).toHaveValue('Can credits transfer?');
  });

  it('shows a system error on failure and retries without duplicating the question', async () => {
    api.chat.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'down')).mockResolvedValueOnce(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'Q one');
    expect(await screen.findByText('Something went wrong on our side')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/You need 50% overall/)).toBeInTheDocument();
    expect(screen.getAllByText('Q one')).toHaveLength(1);
  });

  it('sends earlier answered turns as history, and a placeholder for abstentions', async () => {
    api.chat.mockResolvedValueOnce(ABSTAINED).mockResolvedValueOnce(ANSWER);
    const user = userEvent.setup();
    renderWithState(<ChatPage />);
    await ask(user, 'First');
    await screen.findByText('Why no answer?');
    await ask(user, 'Second');
    expect(api.chat).toHaveBeenLastCalledWith('Second', [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'No answer found in the approved documents.' },
    ]);
  });

  it('disables Send for empty input and caps the question at 500 characters', () => {
    renderWithState(<ChatPage />);
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
    expect(screen.getByLabelText('Your question')).toHaveAttribute('maxLength', '500');
  });
});
