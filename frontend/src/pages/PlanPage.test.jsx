import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api, planBody } from '../api/client.js';
import { ApiError } from '../api/errors.js';
import * as mock from '../api/mock.js';
import { STORAGE_KEY } from '../state/AppState.jsx';
import { renderWithState } from '../test/render.jsx';
import PlanPage from './PlanPage.jsx';

vi.mock('../api/client.js', async (orig) => ({
  ...(await orig()),
  api: { getUnits: vi.fn(), recommend: vi.fn(), sharePlan: vi.fn() },
}));

const saved = (profile = mock.SAMPLE_PROFILE) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile, start: '2027-0', load: 3, swaps: [] }));

beforeEach(() => {
  api.getUnits.mockImplementation(() => mock.getUnits());
  api.recommend.mockImplementation((profile, load) => mock.recommend(planBody(profile, load)));
});
afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
});

describe('PlanPage', () => {
  it('offers a first semester from the planner when there is no plan yet', async () => {
    const user = userEvent.setup();
    renderWithState(<PlanPage />);
    expect(screen.getByText('No passed units yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled();
    // The card lists the first semester the planner will suggest.
    expect(await screen.findByText('COS30008')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use this semester' }));
    expect(await screen.findByRole('heading', { name: 'Recommended units' }, { timeout: 3000 })).toBeInTheDocument();
    expect(api.recommend).toHaveBeenCalledWith({ major: 'artificial-intelligence', units: {} }, 3);
    expect(screen.getAllByText('Not saved yet')[0]).toBeInTheDocument();
  });

  it('shows the saved plan with its checks, stats and road to graduation', async () => {
    saved();
    renderWithState(<PlanPage />);
    expect(await screen.findByText('All 3 units meet their prerequisites.', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'January 2027' })).toBeInTheDocument();
    expect(screen.getByText('Artificial Intelligence · Year 2 · 8 units passed, 1 to retake')).toBeInTheDocument();
    expect(screen.getByText('100 / 300')).toBeInTheDocument();
    expect(screen.getByText('September 2028', { selector: '.stat__value' })).toBeInTheDocument();
    expect(screen.getAllByText('Saved on this device')[0]).toBeInTheDocument();

    expect(screen.getAllByText('Retake').length).toBeGreaterThan(0);
    expect(screen.getByText('Critical path')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prerequisite path' })).toBeInTheDocument();
    expect(screen.getByText(/Needs COS20007 or COS30008 first\. You can take it from May 2027\./)).toBeInTheDocument();
    expect(screen.getByText('Graduate')).toBeInTheDocument();
  });

  it('warns that a 4-unit load needs approval and re-plans', async () => {
    saved();
    const user = userEvent.setup();
    renderWithState(<PlanPage />);
    await screen.findByText('All 3 units meet their prerequisites.', {}, { timeout: 3000 });
    await user.selectOptions(screen.getAllByRole('combobox', { name: /Load/ })[0], '4');
    expect(screen.getByText('Taking 4 units needs approval from the Academic Office.')).toBeInTheDocument();
    await waitFor(() => expect(api.recommend).toHaveBeenLastCalledWith(mock.SAMPLE_PROFILE, 4));
    expect(screen.getAllByText('Not saved yet')[0]).toBeInTheDocument();
  });

  it('shows rules and swaps a unit without breaking a prerequisite', async () => {
    saved();
    const user = userEvent.setup();
    renderWithState(<PlanPage />);
    await screen.findByText('All 3 units meet their prerequisites.', {}, { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: 'Show rules for COS20007' }));
    expect(screen.getByText('COS10009 (passed)')).toBeInTheDocument();

    const swapButtons = screen.getAllByRole('button', { name: 'Swap' });
    await user.click(swapButtons[2]);
    const group = screen.getByRole('group', { name: /^Swap / });
    const option = within(group).queryAllByRole('button')[0];
    if (!option) return expect(within(group).getByText(/No later unit can take this place/)).toBeInTheDocument();
    const code = option.textContent.slice(0, 8);
    await user.click(option);
    expect(screen.getByText('All 3 units meet their prerequisites.')).toBeInTheDocument();
    expect(screen.getAllByText(code).length).toBeGreaterThan(0);
  });

  it('edits units in a dialog and saves them to the profile', async () => {
    const user = userEvent.setup();
    renderWithState(<PlanPage />);
    await user.click(screen.getByRole('button', { name: 'Add my units' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit my units' });
    await within(dialog).findByText('Introduction to Programming');
    await user.click(
      within(dialog).getByRole('radiogroup', { name: 'Status of COS10009' }).querySelector('input[value="passed"]')
    );
    await user.selectOptions(within(dialog).getByLabelText('Grade for COS10009'), 'HD');
    expect(within(dialog).getByText('1 passed · 0 to retake · 0 enrolled')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save units' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(api.recommend).toHaveBeenLastCalledWith(
        { major: 'artificial-intelligence', units: { COS10009: { status: 'passed', grade: 'HD' } } },
        3
      )
    );
  });

  it('shows a service error with a retry when planning fails', async () => {
    saved();
    api.recommend.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'down'));
    const user = userEvent.setup();
    renderWithState(<PlanPage />);
    expect(await screen.findByText("We couldn't reach the advising service")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('All 3 units meet their prerequisites.', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('shares the plan as a code with no name or student ID', async () => {
    saved();
    api.sharePlan.mockResolvedValue({ code: 'A7-3K' });
    const user = userEvent.setup();
    renderWithState(<PlanPage />);
    await screen.findByText('All 3 units meet their prerequisites.', {}, { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: 'Share with advisor' }));
    expect(await screen.findByText('A7-3K')).toBeInTheDocument();
    const sent = api.sharePlan.mock.calls[0][0];
    expect(Object.keys(sent).sort()).toEqual(['load', 'major', 'start', 'swaps', 'units']);
  });

  it('explains that sharing is not on the server yet when it returns 404', async () => {
    saved();
    api.sharePlan.mockRejectedValue(new ApiError(404, 'HTTP_404', 'Not Found'));
    const user = userEvent.setup();
    renderWithState(<PlanPage />);
    await screen.findByText('All 3 units meet their prerequisites.', {}, { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: 'Share with advisor' }));
    expect(await screen.findByText(/Plan sharing is not available on this server yet\./)).toBeInTheDocument();
  });
});
