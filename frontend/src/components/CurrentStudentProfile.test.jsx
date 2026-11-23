import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api/client.js';
import { ApiError } from '../api/errors.js';
import { renderWithState } from '../test/render.jsx';
import App from '../App.jsx';
import MarkdownContent from './MarkdownContent.jsx';

vi.mock('../api/client.js', () => ({
  api: {
    getMajors: vi.fn(),
    getUnits: vi.fn(),
    recommend: vi.fn(),
    chat: vi.fn(),
    getStudent: vi.fn(),
    saveStudent: vi.fn(),
    planStudent: vi.fn(),
  },
}));

const MAJORS = {
  majors: [
    { id: 'artificial-intelligence', name: 'Artificial Intelligence' },
    { id: 'software-development', name: 'Software Development' },
  ],
};

const UNITS = {
  units: [
    { code: 'COS10009', name: 'Introduction to Programming', credit_points: 12.5 },
    { code: 'COS20007', name: 'Object Oriented Programming', credit_points: 12.5 },
    { code: 'COS30019', name: 'Introduction to AI', credit_points: 12.5 },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  window.location.hash = '';
  api.getMajors.mockResolvedValue(MAJORS);
  api.getUnits.mockResolvedValue(UNITS);
});

describe('Current Students Advising Module', () => {
  it('switches between First-Year and Current Student modes in the sidebar', async () => {
    const user = userEvent.setup();
    renderWithState(<App />);

    expect(await screen.findByText('Your study profile')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Current Student' }));
    expect(await screen.findByText('Current student profile')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'First-Year' }));
    expect(await screen.findByText('Your study profile')).toBeInTheDocument();
  });

  it('looks up an existing student, handles 404 for new students, and assigns units mutually exclusively', async () => {
    api.getStudent
      .mockRejectedValueOnce(new ApiError(404, 'STUDENT_NOT_FOUND', 'Not found'))
      .mockResolvedValueOnce({
        student_id: 100001,
        major_code: 'artificial-intelligence',
        target_career: 'ML Engineer',
        study_goal: 'Graduate on time',
        passed_units: ['COS10009'],
        failed_units: ['COS20007'],
        enrolled_units: [],
      });

    const user = userEvent.setup();
    renderWithState(<App />);
    await user.click(screen.getByRole('button', { name: 'Current Student' }));

    const idInput = await screen.findByLabelText('Student ID');
    await user.type(idInput, '999999');
    await user.click(screen.getByRole('button', { name: 'Load profile' }));
    expect(await screen.findByText('New profile for Student #999999')).toBeInTheDocument();

    await user.clear(idInput);
    await user.type(idInput, '100001');
    await user.click(screen.getByRole('button', { name: 'Load profile' }));
    expect(await screen.findByText('Profile loaded for Student #100001')).toBeInTheDocument();
    expect(screen.getByLabelText('Target career')).toHaveValue('ML Engineer');

    // Mutually exclusive toggle: switch COS10009 from Passed to Enrolled
    const cos10009Group = screen.getByRole('group', { name: 'Status for COS10009' });
    expect(within(cos10009Group).getByRole('button', { name: 'Passed' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(cos10009Group).getByRole('button', { name: 'Currently Enrolled' }));
    expect(within(cos10009Group).getByRole('button', { name: 'Passed' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(cos10009Group).getByRole('button', { name: 'Currently Enrolled' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('saves profile, generates roadmap with Retake Required badge, blocked units, and dag_graph', async () => {
    api.getStudent.mockResolvedValue({
      student_id: 100001,
      major_code: 'artificial-intelligence',
      target_career: 'ML Engineer',
      study_goal: 'Graduate on time',
      passed_units: ['COS10009'],
      failed_units: ['COS20007'],
      enrolled_units: [],
    });
    api.planStudent.mockResolvedValue({
      major: { id: 'artificial-intelligence', name: 'Artificial Intelligence' },
      semesters: [
        {
          index: 1,
          name: 'Semester 1',
          credit_points: 12.5,
          units: [
            {
              code: 'COS20007',
              name: 'Object Oriented Programming',
              credit_points: 12.5,
              rank: 1,
              is_retake: true,
              reason: 'Retake required',
            },
          ],
        },
      ],
      blocked_units: [
        {
          code: 'COS30019',
          name: 'Introduction to AI',
          credit_points: 12.5,
          missing_prereqs: ['COS20007'],
          available_after: 'Semester 1',
        },
      ],
      violations: 0,
      completed_units: ['COS10009'],
      failed_units: ['COS20007'],
      enrolled_units: [],
      dag_graph: {
        nodes: [
          { id: 'COS10009', label: 'COS10009 · Intro to Programming', status: 'passed' },
          { id: 'COS20007', label: 'COS20007 · OOP', status: 'retake' },
          { id: 'COS30019', label: 'COS30019 · Intro to AI', status: 'blocked' },
        ],
        edges: [
          { source: 'COS10009', target: 'COS20007', rule_type: 'prereq' },
          { source: 'COS20007', target: 'COS30019', rule_type: 'prereq' },
        ],
      },
    });

    const user = userEvent.setup();
    renderWithState(<App />);
    await user.click(screen.getByRole('button', { name: 'Current Student' }));

    await user.type(await screen.findByLabelText('Student ID'), '100001');
    await user.click(screen.getByRole('button', { name: 'Load profile' }));
    await screen.findByText('Profile loaded for Student #100001');

    await user.click(screen.getByRole('button', { name: '3 units / semester' }));
    await user.click(screen.getByRole('button', { name: 'Generate roadmap' }));

    expect((await screen.findAllByText('Retake Required')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Blocked: needs COS20007')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Prerequisite dependency graph' })).toBeInTheDocument();
    expect(api.planStudent).toHaveBeenCalledWith(100001, {
      major_override: 'artificial-intelligence',
      units_per_semester: 3,
    });
  });

  it('passes active student_id to POST /api/chat in Current Student mode', async () => {
    api.chat.mockResolvedValue({
      answer: 'Personalized answer [1]',
      citations: [{ id: 'c1', doc: 'Outline', section: '§1', page: 1, snippet: 'text', similarity: 0.9, url: null }],
      abstained: false,
      abstain_reason: null,
      top_similarity: 0.9,
      threshold: 0.7,
      sources_checked: 1,
      sources_passed: 1,
    });

    const user = userEvent.setup();
    renderWithState(<App />);
    await user.click(screen.getByRole('button', { name: 'Current Student' }));
    await user.type(await screen.findByLabelText('Student ID'), '100001');

    await user.click(screen.getByRole('link', { name: 'Ask the syllabus' }));
    await user.type(screen.getByLabelText('Your question'), 'Can I take COS30019?');
    await user.click(screen.getByRole('button', { name: 'Send question' }));

    expect(await screen.findByText(/Personalized answer/)).toBeInTheDocument();
    expect(api.chat).toHaveBeenCalledWith('Can I take COS30019?', [], 100001);
  });

  it('renders Markdown tables and Mermaid diagrams', () => {
    const md = [
      '| Unit | Status |',
      '| --- | --- |',
      '| COS20007 | Retake |',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[COS20007] --> B[COS30019]',
      '```',
    ].join('\n');

    renderWithState(<MarkdownContent text={md} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Retake')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mermaid diagram' })).toBeInTheDocument();
  });

  it('displays all 5 CS majors, groups units into Core vs Major, and preserves assignments when switching majors', async () => {
    const user = userEvent.setup();
    renderWithState(<App />);
    await user.click(screen.getByRole('button', { name: 'Current Student' }));

    for (const majorName of [
      'Artificial Intelligence',
      'Data Science',
      'Software Development',
      'Internet of Things',
      'Cybersecurity',
    ]) {
      expect(await screen.findByRole('button', { name: majorName })).toBeInTheDocument();
    }

    const coreSection = await screen.findByRole('region', { name: 'Computer Science Core Units' });
    expect(coreSection).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Artificial Intelligence Major Units' })).toBeInTheDocument();

    // Assign COS10009 (a Core unit) as Passed
    const cos10009Group = within(coreSection).getByRole('group', { name: 'Status for COS10009' });
    await user.click(within(cos10009Group).getByRole('button', { name: 'Passed' }));
    expect(within(cos10009Group).getByRole('button', { name: 'Passed' })).toHaveAttribute('aria-pressed', 'true');

    // Switch major to Data Science and verify Major Units section updates while COS10009 remains Passed
    await user.click(screen.getByRole('button', { name: 'Data Science' }));
    expect(await screen.findByRole('region', { name: 'Data Science Major Units' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Status for COS10009' })).getByRole('button', { name: 'Passed' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('classifies seeded units into CS Core, AI Major, and Elective Units (Choice) without injecting unseeded units', async () => {
    api.getUnits.mockResolvedValue({
      units: [
        { code: 'COS40005', name: 'Computing Technology Project A', credit_points: 12.5 },
        { code: 'COS10009', name: 'Introduction to Programming', credit_points: 12.5 },
        { code: 'TNE10006', name: 'Networks and Switching', credit_points: 12.5 },
        { code: 'COS20007', name: 'Object Oriented Programming', credit_points: 12.5 },
        { code: 'COS40007', name: 'Artificial Intelligence Engineering', credit_points: 12.5 },
        { code: 'COS20019', name: 'Cloud Computing Architecture', credit_points: 12.5 },
        { code: 'COS30018', name: 'Intelligent Systems', credit_points: 12.5 },
        { code: 'COS30019', name: 'Introduction to Artificial Intelligence', credit_points: 12.5 },
        { code: 'COS30082', name: 'Applied Machine Learning', credit_points: 12.5 },
        { code: 'SWE30003', name: 'Software Architectures and Design', credit_points: 12.5 },
        { code: 'STA10003', name: 'Foundations of Statistics', credit_points: 12.5 },
        { code: 'MTH10013', name: 'Linear Algebra and Applications', credit_points: 12.5 },
        { code: 'COS10022', name: 'Data Science Principles', credit_points: 12.5 },
        { code: 'COS40003', name: 'Concurrent Programming', credit_points: 12.5 },
      ],
    });

    const user = userEvent.setup();
    renderWithState(<App />);
    await user.click(screen.getByRole('button', { name: 'Current Student' }));

    const coreSection = await screen.findByRole('region', { name: 'Computer Science Core Units' });
    const majorSection = screen.getByRole('region', { name: 'Artificial Intelligence Major Units' });
    const electiveSection = screen.getByRole('region', { name: 'Elective Units (Choice)' });

    for (const code of ['COS10009', 'TNE10006', 'COS20007', 'COS40005']) {
      expect(within(coreSection).getByRole('group', { name: `Status for ${code}` })).toBeInTheDocument();
    }

    for (const code of ['COS20019', 'COS30018', 'COS30019', 'COS30082', 'SWE30003', 'COS40007']) {
      expect(within(majorSection).getByRole('group', { name: `Status for ${code}` })).toBeInTheDocument();
    }

    for (const code of ['STA10003', 'MTH10013', 'COS10022', 'COS40003']) {
      expect(within(electiveSection).getByRole('group', { name: `Status for ${code}` })).toBeInTheDocument();
    }

    // Unseeded curriculum codes must NOT be injected into the UI list
    for (const unseeded of ['COS10025', 'COS40006', 'COS30049', 'LAW20019', 'MDA10018']) {
      expect(screen.queryByRole('group', { name: `Status for ${unseeded}` })).not.toBeInTheDocument();
    }
  });

  it('strips raw CS_* taxonomy IDs and renders strictly the 5 canonical majors', async () => {
    api.getMajors.mockResolvedValue({
      majors: [
        { id: 'CS_AI', name: 'Cs Ai' },
        { id: 'CS_AI_ENGINEERING', name: 'Cs Ai Engineering' },
        { id: 'CS_CLOUD', name: 'Cs Cloud' },
      ],
    });
    renderWithState(<App />);
    expect(await screen.findByRole('button', { name: 'Artificial Intelligence' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Internet of Things' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cs Ai' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cs Ai Engineering' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cs Cloud' })).not.toBeInTheDocument();
  });
});
