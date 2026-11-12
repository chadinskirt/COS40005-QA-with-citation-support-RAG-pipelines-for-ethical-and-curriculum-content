import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api/client.js';
import { ApiError } from '../api/errors.js';
import { renderWithState } from '../test/render.jsx';
import ProfilePage from './ProfilePage.jsx';

vi.mock('../api/client.js', () => ({
  api: { getMajors: vi.fn(), getUnits: vi.fn(), recommend: vi.fn(), chat: vi.fn() },
}));

const MAJORS = {
  majors: [
    { id: 'ai', name: 'Artificial Intelligence' },
    { id: 'sec', name: 'Cybersecurity' },
  ],
};
const UNITS = {
  ai: {
    units: [
      { code: 'COS10009', name: 'Intro to Programming' },
      { code: 'COS30019', name: 'Introduction to AI' },
    ],
  },
  sec: { units: [{ code: 'COS30015', name: 'IT Security' }] },
};
const PLAN = {
  major: { id: 'ai', name: 'Artificial Intelligence' },
  semesters: [
    {
      index: 1,
      name: 'Semester 1',
      credit_points: 12.5,
      units: [{ code: 'COS20007', name: 'OOP', credit_points: 12.5, rank: 1, reason: 'unlocks 2 later units' }],
    },
  ],
  blocked_units: [
    {
      code: 'COS30049',
      name: 'Project',
      credit_points: 12.5,
      missing_prereqs: ['COS30019'],
      available_after: 'Semester 2',
    },
  ],
  violations: 0,
  completed_units: ['COS10009'],
};

beforeEach(() => {
  vi.resetAllMocks();
  api.getMajors.mockResolvedValue(MAJORS);
  api.getUnits.mockImplementation((major) => Promise.resolve(UNITS[major]));
  api.recommend.mockResolvedValue(PLAN);
});

describe('ProfilePage', () => {
  it('selects the first major from the API and lists its units', async () => {
    renderWithState(<ProfilePage />);
    expect(await screen.findByRole('button', { name: 'Artificial Intelligence', pressed: true })).toBeInTheDocument();
    expect(await screen.findByLabelText(/COS10009/)).toBeInTheDocument();
    expect(api.getUnits).toHaveBeenCalledWith('ai');
  });

  it('counts selected units and filters the list by search', async () => {
    const user = userEvent.setup();
    renderWithState(<ProfilePage />);
    await user.click(await screen.findByLabelText(/COS10009/));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search unit code or name'), 'zzz');
    expect(screen.getByText('No unit matches "zzz".')).toBeInTheDocument();
  });

  it('clears the selection when the major changes', async () => {
    const user = userEvent.setup();
    renderWithState(<ProfilePage />);
    await user.click(await screen.findByLabelText(/COS10009/));
    await user.click(screen.getByRole('button', { name: 'Cybersecurity' }));
    expect(await screen.findByLabelText(/COS30015/)).toBeInTheDocument();
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('sends the major and chosen units, then shows the plan', async () => {
    const user = userEvent.setup();
    renderWithState(<ProfilePage />);
    await user.click(await screen.findByLabelText(/COS10009/));
    await user.click(screen.getByRole('button', { name: 'Generate pathway' }));
    expect(api.recommend).toHaveBeenCalledWith('ai', ['COS10009']);
    expect(await screen.findByText('Prerequisite check passed · 0 violations')).toBeInTheDocument();
    const semester = screen.getByRole('region', { name: 'Semester 1' });
    expect(within(semester).getByText('COS20007')).toBeInTheDocument();
    expect(screen.getByText('Blocked: needs COS30019')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update pathway' })).toBeInTheDocument();
  });

  it('warns when the profile changes after a plan was generated', async () => {
    const user = userEvent.setup();
    renderWithState(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: 'Generate pathway' }));
    await screen.findByText('Prerequisite check passed · 0 violations');
    await user.click(screen.getByLabelText(/COS10009/));
    expect(screen.getByText('Your profile changed')).toBeInTheDocument();
  });

  it('shows a red banner when the plan has violations', async () => {
    api.recommend.mockResolvedValue({ ...PLAN, violations: 2 });
    const user = userEvent.setup();
    renderWithState(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: 'Generate pathway' }));
    expect(await screen.findByText('Prerequisite check failed · 2 violations')).toBeInTheDocument();
  });

  it('shows the curriculum error for a cycle', async () => {
    api.recommend.mockRejectedValue(new ApiError(409, 'CURRICULUM_CYCLE', 'cycle', { cycle: ['A', 'B', 'A'] }));
    const user = userEvent.setup();
    renderWithState(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: 'Generate pathway' }));
    expect(await screen.findByText('Curriculum data error')).toBeInTheDocument();
    expect(screen.getByText(/A → B → A/)).toBeInTheDocument();
  });

  it('shows the system error with a working retry', async () => {
    api.recommend.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'down'));
    const user = userEvent.setup();
    renderWithState(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: 'Generate pathway' }));
    expect(await screen.findByText('Something went wrong on our side')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Prerequisite check passed · 0 violations')).toBeInTheDocument();
  });

  it('shows the backend message for a rejected request', async () => {
    api.recommend.mockRejectedValueOnce(
      new ApiError(422, 'UNKNOWN_UNIT', 'Unknown unit code(s): XXX999.', { units: ['XXX999'] })
    );
    const user = userEvent.setup();
    renderWithState(<ProfilePage />);
    await user.click(await screen.findByRole('button', { name: 'Generate pathway' }));
    expect(await screen.findByText(/Unknown unit code\(s\): XXX999\./)).toBeInTheDocument();
    expect(screen.queryByText(/not responding/)).not.toBeInTheDocument();
  });

  it('shows an error with retry when majors fail to load', async () => {
    api.getMajors.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
    const user = userEvent.setup();
    renderWithState(<ProfilePage />);
    expect(await screen.findByText(/Could not reach the server\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Artificial Intelligence' })).toBeInTheDocument();
  });
});
