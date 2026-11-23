import { Fragment, useMemo, useState } from 'react';
import katex from 'katex';

function renderMathHtml(expr, displayMode) {
  return katex.renderToString(expr.trim(), {
    displayMode,
    throwOnError: false,
  });
}

function renderInline(text) {
  const parts = [];
  // Order matters: inline code (`...`) first so math/markdown inside code is never transformed.
  const regex =
    /(`[^`]+`|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\s)(?:\\.|[^$\n])+?(?<!\s)\$|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(
        <code key={key++} className="md-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('$$') && token.endsWith('$$')) {
      parts.push(
        <span
          key={key++}
          className="md-math-display"
          dangerouslySetInnerHTML={{ __html: renderMathHtml(token.slice(2, -2), true) }}
        />
      );
    } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
      parts.push(
        <span
          key={key++}
          className="md-math-display"
          dangerouslySetInnerHTML={{ __html: renderMathHtml(token.slice(2, -2), true) }}
        />
      );
    } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
      parts.push(
        <span
          key={key++}
          className="md-math-inline"
          dangerouslySetInnerHTML={{ __html: renderMathHtml(token.slice(2, -2), false) }}
        />
      );
    } else if (token.startsWith('$') && token.endsWith('$')) {
      parts.push(
        <span
          key={key++}
          className="md-math-inline"
          dangerouslySetInnerHTML={{ __html: renderMathHtml(token.slice(1, -1), false) }}
        />
      );
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

function parseMermaidFlowchart(source) {
  const lines = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  if (lines.length === 0) return null;

  let direction = 'TD';
  const header = lines[0].match(/^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i);
  if (header) direction = header[1].toUpperCase();

  const nodes = new Map();
  const edges = [];

  const ensureNode = (id, label) => {
    if (!nodes.has(id)) nodes.set(id, { id, label: label || id });
    else if (label && nodes.get(id).label === id) nodes.get(id).label = label;
  };

  const parseNodeToken = (raw) => {
    const clean = raw.trim().replace(/;$/, '');
    const m = clean.match(/^([A-Za-z0-9_-]+)\s*(?:\[\[([^\]]+)\]\]|\(\(([^)]+)\)\)|\(\[([^\]]+)\]\)|\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})?$/);
    if (!m) return null;
    const id = m[1];
    const label = (m[2] || m[3] || m[4] || m[5] || m[6] || m[7] || id).replace(/^["']|["']$/g, '');
    ensureNode(id, label);
    return id;
  };

  for (let i = header ? 1 : 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(subgraph|end|classDef|class|style|linkStyle)\b/i.test(line)) continue;
    const edgeMatch = line.match(/^(.+?)\s*(-->|-.->|==>|--\s*[^->]+\s*-->)\s*(?:\|([^|]+)\|\s*)?(.+)$/);
    if (edgeMatch) {
      const fromId = parseNodeToken(edgeMatch[1]);
      const toId = parseNodeToken(edgeMatch[4]);
      const arrow = edgeMatch[2];
      const edgeLabel = edgeMatch[3]?.trim() || '';
      if (fromId && toId) {
        edges.push({ source: fromId, target: toId, label: edgeLabel, dashed: arrow.includes('.') });
      }
    } else {
      parseNodeToken(line);
    }
  }

  if (nodes.size === 0) return null;
  return { direction, nodes: [...nodes.values()], edges };
}

function MermaidDiagram({ code }) {
  const [showSource, setShowSource] = useState(false);
  const parsed = useMemo(() => parseMermaidFlowchart(code), [code]);

  const layout = useMemo(() => {
    if (!parsed) return null;
    const isLR = parsed.direction === 'LR' || parsed.direction === 'RL';
    const incoming = new Map(parsed.nodes.map((n) => [n.id, []]));
    for (const e of parsed.edges) {
      if (incoming.has(e.target) && incoming.has(e.source)) incoming.get(e.target).push(e.source);
    }
    const depth = new Map();
    const visiting = new Set();
    const getDepth = (id) => {
      if (depth.has(id)) return depth.get(id);
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const preds = incoming.get(id) ?? [];
      const d = preds.length === 0 ? 0 : Math.max(...preds.map((p) => getDepth(p) + 1));
      visiting.delete(id);
      depth.set(id, d);
      return d;
    };
    parsed.nodes.forEach((n) => getDepth(n.id));

    const groups = new Map();
    for (const n of parsed.nodes) {
      const d = depth.get(n.id) ?? 0;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(n);
    }

    const W = 160;
    const H = 44;
    const GAP_X = isLR ? 56 : 24;
    const GAP_Y = isLR ? 18 : 48;
    const PAD = 16;

    const maxLayer = Math.max(0, ...groups.keys());
    let maxPerLayer = 1;
    const pos = new Map();
    for (let l = 0; l <= maxLayer; l++) {
      const list = groups.get(l) ?? [];
      maxPerLayer = Math.max(maxPerLayer, list.length);
      list.forEach((n, idx) => {
        pos.set(n.id, {
          x: PAD + (isLR ? l * (W + GAP_X) : idx * (W + GAP_X)),
          y: PAD + (isLR ? idx * (H + GAP_Y) : l * (H + GAP_Y)),
        });
      });
    }

    const width = PAD * 2 + (isLR ? (maxLayer + 1) * W + maxLayer * GAP_X : maxPerLayer * W + Math.max(0, maxPerLayer - 1) * GAP_X);
    const height = PAD * 2 + (isLR ? maxPerLayer * H + Math.max(0, maxPerLayer - 1) * GAP_Y : (maxLayer + 1) * H + maxLayer * GAP_Y);
    return { isLR, W, H, pos, width, height };
  }, [parsed]);

  return (
    <div className="mermaid-box">
      <div className="row between gap-2">
        <span className="t-caption c-secondary">Diagram</span>
        <button type="button" className="mermaid-toggle t-caption" onClick={() => setShowSource((v) => !v)}>
          {showSource ? 'Show diagram' : 'View source'}
        </button>
      </div>
      {!showSource && parsed && layout ? (
        <div className="mermaid-scroll">
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width={layout.width}
            height={layout.height}
            role="img"
            aria-label="Mermaid diagram"
          >
            <defs>
              <marker id="mmd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#2f5bd3" />
              </marker>
            </defs>
            {parsed.edges.map((e, i) => {
              const from = layout.pos.get(e.source);
              const to = layout.pos.get(e.target);
              if (!from || !to) return null;
              const x1 = layout.isLR ? from.x + layout.W : from.x + layout.W / 2;
              const y1 = layout.isLR ? from.y + layout.H / 2 : from.y + layout.H;
              const x2 = layout.isLR ? to.x : to.x + layout.W / 2;
              const y2 = layout.isLR ? to.y + layout.H / 2 : to.y;
              return (
                <g key={i}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#2f5bd3"
                    strokeWidth="1.5"
                    strokeDasharray={e.dashed ? '4 4' : undefined}
                    markerEnd="url(#mmd-arrow)"
                  />
                  {e.label && (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} fontSize="10" textAnchor="middle" fill="#5b6678">
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {parsed.nodes.map((n) => {
              const p = layout.pos.get(n.id);
              const label = n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label;
              return (
                <g key={n.id} transform={`translate(${p.x}, ${p.y})`}>
                  <rect width={layout.W} height={layout.H} rx={8} fill="#e8eefc" stroke="#2f5bd3" strokeWidth="1.5" />
                  <text x={layout.W / 2} y={layout.H / 2 + 4} fontSize="12" fontWeight="600" textAnchor="middle" fill="#1c2533">
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <pre className="md-code-block">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

function isTableRow(line) {
  return line.trim().startsWith('|') && line.trim().endsWith('|');
}

function isTableSeparator(line) {
  return /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(line.trim());
}

function parseTableCells(line) {
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
}

function parseBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code / mermaid block
    const fence = line.trim().match(/^```(\w*)/);
    if (fence) {
      const lang = fence[1].toLowerCase();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: lang === 'mermaid' ? 'mermaid' : 'code', lang, content: buf.join('\n') });
      continue;
    }

    // Display math block: \[ ... \] or $$ ... $$
    const trimmed = line.trim();
    if (trimmed.startsWith('\\[') || trimmed.startsWith('$$')) {
      const isBracket = trimmed.startsWith('\\[');
      const closeToken = isBracket ? '\\]' : '$$';
      if (trimmed.endsWith(closeToken) && trimmed.length > 4) {
        blocks.push({ type: 'math', content: trimmed.slice(2, -2).trim() });
        i++;
        continue;
      }
      const buf = [trimmed.slice(2)];
      i++;
      while (i < lines.length) {
        const cur = lines[i];
        const endIdx = cur.indexOf(closeToken);
        if (endIdx !== -1) {
          buf.push(cur.slice(0, endIdx));
          i++;
          break;
        }
        buf.push(cur);
        i++;
      }
      blocks.push({ type: 'math', content: buf.join('\n').trim() });
      continue;
    }

    // Markdown table
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableCells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseTableCells(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, content: heading[2] });
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Paragraph
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('\\[') &&
      !lines[i].trim().startsWith('$$') &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'p', content: para.join(' ') });
  }

  return blocks;
}

/** Renders Markdown text including tables, Mermaid diagrams, lists, and code blocks. */
export default function MarkdownContent({ text }) {
  const blocks = useMemo(() => parseBlocks(text || ''), [text]);

  return (
    <div className="md-content stack gap-3">
      {blocks.map((b, idx) => {
        if (b.type === 'mermaid') return <MermaidDiagram key={idx} code={b.content} />;
        if (b.type === 'math') {
          return (
            <div
              key={idx}
              className="md-math-block"
              dangerouslySetInnerHTML={{ __html: renderMathHtml(b.content, true) }}
            />
          );
        }
        if (b.type === 'code') {
          return (
            <pre key={idx} className="md-code-block">
              <code>{b.content}</code>
            </pre>
          );
        }
        if (b.type === 'table') {
          return (
            <div key={idx} className="md-table-wrap">
              <table className="md-table">
                <thead>
                  <tr>
                    {b.headers.map((h, hi) => (
                      <th key={hi}>{renderInline(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (b.type === 'heading') {
          const Tag = b.level === 1 ? 'h2' : b.level === 2 ? 'h3' : 'h4';
          return (
            <Tag key={idx} className={b.level === 1 ? 't-h2' : 't-label'}>
              {renderInline(b.content)}
            </Tag>
          );
        }
        if (b.type === 'ul') {
          return (
            <ul key={idx} className="md-list t-body">
              {b.items.map((item, ii) => (
                <li key={ii}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === 'ol') {
          return (
            <ol key={idx} className="md-list t-body">
              {b.items.map((item, ii) => (
                <li key={ii}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <Fragment key={idx}>
            <p className="t-body">{renderInline(b.content)}</p>
          </Fragment>
        );
      })}
    </div>
  );
}
