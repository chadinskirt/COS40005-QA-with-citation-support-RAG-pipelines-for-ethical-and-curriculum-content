import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
<<<<<<< Updated upstream
import MarkdownContent, { parseBlocks } from './MarkdownContent.jsx';
=======
import MarkdownContent from './MarkdownContent.jsx';
>>>>>>> Stashed changes
import { parseFlowchart } from './PrereqMap.jsx';

describe('MarkdownContent', () => {
  it('renders display and inline maths', () => {
    const md = ['\\[', 'E = mc^2', '\\]', '', 'The complexity is \\(O(n \\log n)\\) and $cp = 12.5$.'].join('\n');
    const { container } = render(<MarkdownContent text={md} />);
    expect(container.querySelectorAll('.katex-display')).toHaveLength(1);
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3);
  });

  it('leaves maths alone inside code', () => {
    const md = ['Use `\\(x^2\\)` here.', '', '```python', 'expr = "$$a + b$$"', '```'].join('\n');
    const { container } = render(<MarkdownContent text={md} />);
    expect(container.querySelectorAll('.katex')).toHaveLength(0);
    expect(screen.getByText('\\(x^2\\)')).toBeInTheDocument();
    expect(screen.getByText('expr = "$$a + b$$"')).toBeInTheDocument();
  });

<<<<<<< Updated upstream
  it('keeps a lone "# " line as text instead of hanging', () => {
    expect(parseBlocks('Intro\n# \nMore')).toEqual([
      { type: 'p', content: 'Intro' },
      { type: 'p', content: '#' },
      { type: 'p', content: 'More' },
    ]);
  });

=======
>>>>>>> Stashed changes
  it('turns [n] into buttons that open source n', async () => {
    const onCite = vi.fn();
    render(<MarkdownContent text="Needs COS20007 [1] and a plan [2]." onCite={onCite} activeCite={2} />);
    await userEvent.click(screen.getByRole('button', { name: 'Source 1' }));
    expect(onCite).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: 'Source 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows unit codes as chips and adds a share bar for a weight column', () => {
    const md = [
      '| Task | Weight |',
      '| --- | --- |',
      '| COS20031 Database Design Project | 20% |',
      '| Exam | 80% |',
    ].join('\n');
    const { container } = render(<MarkdownContent text={md} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(container.querySelector('.unit-code')).toHaveTextContent('COS20031');
    expect(screen.getByText('Share of the final mark')).toBeInTheDocument();
    expect(screen.getByText('80% · Exam')).toBeInTheDocument();
  });

  it('draws a Mermaid flowchart as a prerequisite map coloured from the plan', () => {
    const md = ['```mermaid', 'flowchart LR', '  A["A: Intro"] --> B["B: Next"]', '  A -.-> C["C: Other"]', '```'].join(
      '\n'
    );
    const status = (code) => (code === 'A' ? { status: 'passed', label: 'Passed' } : {});
    const { container } = render(<MarkdownContent text={md} unitStatus={status} focus="B" />);
    expect(screen.getByText('Prerequisite map')).toBeInTheDocument();
    expect(container.querySelector('.pnode--passed')).toHaveTextContent('Passed');
    expect(container.querySelector('.pnode--focus')).toHaveTextContent('B');
    expect(container.querySelector('.pnode--alt')).toHaveTextContent('Also meets the prerequisite');
  });

  it('parses node labels and dashed edges', () => {
    const g = parseFlowchart('graph TD\nX[X] --> Y("Y: two")\nY -.-> Z');
    expect(g.nodes.map((n) => n.label)).toEqual(['X', 'Y: two', 'Z']);
    expect(g.edges.map((e) => e.dashed)).toEqual([false, true]);
<<<<<<< Updated upstream
  });

  it('renders Gemini-style citation pills for #citation-N and [1, 2] markers and triggers callbacks', async () => {
    const onCitationClick = vi.fn();
    const user = userEvent.setup();
    const citations = [
      { unit_code: 'COS30082', section: 'overview', content: 'ML overview excerpt.' },
      { unit_code: 'COS30082', section: 'assessments', content: 'Final exam 50%.' },
    ];
    const md = 'See [COS30082 Unit Outline](#citation-2) and [1, 2].';
    render(<MarkdownContent text={md} citations={citations} onCitationClick={onCitationClick} />);

    const pills = screen.getAllByRole('button', { name: /Open source/i });
    expect(pills).toHaveLength(3);

    await user.click(pills[0]);
    expect(onCitationClick).toHaveBeenCalledWith(2);

    await user.click(pills[1]);
    expect(onCitationClick).toHaveBeenCalledWith(1);
=======
>>>>>>> Stashed changes
  });
});
