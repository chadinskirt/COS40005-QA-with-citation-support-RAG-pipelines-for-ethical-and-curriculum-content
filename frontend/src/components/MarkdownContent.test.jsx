import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownContent from './MarkdownContent.jsx';

describe('MarkdownContent LaTeX & Markdown rendering', () => {
  it('renders Ollama display equations \\[ ... \\] and standard $$ ... $$ in display mode', () => {
    const md = ['\\[', 'E = mc^2', '\\]', '', '$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$'].join('\n');
    const { container } = render(<MarkdownContent text={md} />);
    const displays = container.querySelectorAll('.katex-display');
    expect(displays).toHaveLength(2);
  });

  it('renders Ollama inline equations \\( ... \\) and standard $ ... $ in inline mode', () => {
    const md = 'The complexity is \\(O(n \\log n)\\) and credit points are $cp = 12.5$.';
    const { container } = render(<MarkdownContent text={md} />);
    expect(container.querySelectorAll('.katex-display')).toHaveLength(0);
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
  });

  it('preserves math delimiters inside fenced code blocks, inline code, and Mermaid diagrams', () => {
    const md = [
      'Use `\\(x^2\\)` or `$y$` in inline code.',
      '',
      '```python',
      'expr = "$$a + b$$ and \\[c\\]"',
      '```',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[Step 1] --> B[Step 2]',
      '```',
    ].join('\n');

    const { container } = render(<MarkdownContent text={md} />);
    expect(container.querySelectorAll('.katex')).toHaveLength(0);
    expect(screen.getByText('\\(x^2\\)')).toBeInTheDocument();
    expect(screen.getByText('$y$')).toBeInTheDocument();
    expect(screen.getByText('expr = "$$a + b$$ and \\[c\\]"')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mermaid diagram' })).toBeInTheDocument();
  });

  it('renders math inside Markdown tables without breaking table structure', () => {
    const md = ['| Formula | Meaning |', '| --- | --- |', '| \\(WAM = \\frac{\\sum m_i}{n}\\) | Weighted Average Mark |'].join(
      '\n'
    );
    const { container } = render(<MarkdownContent text={md} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Weighted Average Mark')).toBeInTheDocument();
  });
});
