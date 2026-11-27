import { createContext, Fragment, useContext, useMemo } from 'react';
import katex from 'katex';
import { UnitCode } from './Badge.jsx';
import Icon from './Icon.jsx';
import PrereqMap from './PrereqMap.jsx';

// Answer text is Markdown from the LLM: paragraphs, headings, lists, tables, quotes, code, KaTeX math
// and Mermaid flowcharts. [n] markers become buttons that open source n.
const CiteCtx = createContext({ onCite: null, active: null });

const renderMath = (expr, displayMode) => katex.renderToString(expr.trim(), { displayMode, throwOnError: false });

const INLINE =
  /(`[^`]+`|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\s)(?:\\.|[^$\n])+?(?<!\s)\$|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]\n]+\]\([^)\s]+\)|\[\d{1,2}(?:\s*,\s*\d{1,2})*\])/g;

function CiteRef({ n }) {
  const { onCite, active } = useContext(CiteCtx);
  if (!onCite) return <span className="cite-ref">[{n}]</span>;
  return (
    <button
      type="button"
      className="cite-ref"
      aria-label={`Source ${n}`}
      aria-pressed={active === n}
      onClick={() => onCite(n)}
    >
      [{n}]
    </button>
  );
}

function renderCitationPill(citIndex, citations, onSelect, key) {
  const citation = citations?.[citIndex - 1];
  const label = citation?.unit_code
    ? `${citation.unit_code}${citation.section ? ` · ${citation.section}` : ''}`
    : String(citIndex);
  const rawExcerpt = (citation?.content || citation?.snippet || citation?.text_snippet || '').trim();
  const previewLines = rawExcerpt.split(/\r?\n/).slice(0, 2).join(' ').slice(0, 140);

  return (
    <span key={key} className="cite-pill-wrap">
      <button
        type="button"
        className="cite-pill t-caption"
        aria-label={`Open source ${citIndex}${citation?.unit_code ? `: ${citation.unit_code}` : ''}`}
        onClick={(e) => {
          e.preventDefault();
          onSelect?.(citIndex, citation);
        }}
      >
        <Icon name="file" size={12} />
        <span>{label}</span>
      </button>
      {citation && (
        <span className="cite-tooltip" role="tooltip">
          <strong>
            [{citIndex}] {citation.unit_code || citation.doc}
            {citation.section ? ` · ${citation.section}` : ''}
          </strong>
          {previewLines && <span className="cite-tooltip__excerpt">{previewLines}</span>}
        </span>
      )}
    </span>
  );
}

function renderInline(text, onCitationClick, citations = []) {
  const parts = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const t = match[0];
    const k = key++;
    if (t.startsWith('`')) parts.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('$$') || t.startsWith('\\['))
      parts.push(
        <span key={k} className="md-math" dangerouslySetInnerHTML={{ __html: renderMath(t.slice(2, -2), true) }} />
      );
    else if (t.startsWith('\\('))
      parts.push(
        <span key={k} className="md-math" dangerouslySetInnerHTML={{ __html: renderMath(t.slice(2, -2), false) }} />
      );
    else if (t.startsWith('$'))
      parts.push(
        <span key={k} className="md-math" dangerouslySetInnerHTML={{ __html: renderMath(t.slice(1, -1), false) }} />
      );
    else if (t.startsWith('**')) parts.push(<strong key={k}>{renderInline(t.slice(2, -2), onCitationClick, citations)}</strong>);
    else if (t.startsWith('[')) {
      const linkMatch = t.match(/^\[([^\]\n]+)\]\(([^)\s]+)\)$/);
      const numMatch = !linkMatch && t.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const citMatch = href.match(/^#citation-(\d+)$/i);
        if (citMatch) {
          parts.push(renderCitationPill(Number(citMatch[1]), citations, onCitationClick, k));
        } else if (/^https?:\/\//i.test(href)) {
          parts.push(
            <a key={k} href={href} target="_blank" rel="noreferrer" className="md-link">
              {label}
            </a>
          );
        } else {
          parts.push(label);
        }
      } else if (numMatch) {
        const nums = numMatch[1].split(',').map((n) => Number(n.trim()));
        if (nums.length > 1 || onCitationClick) {
          nums.forEach((citIndex, ni) => {
            if (ni > 0) parts.push(' ');
            parts.push(renderCitationPill(citIndex, citations, onCitationClick, `${k}-${ni}`));
          });
        } else {
          parts.push(<CiteRef key={k} n={nums[0]} />);
        }
      } else {
        parts.push(t);
      }
    } else parts.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = match.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const isRow = (l) => l.trim().startsWith('|') && l.trim().endsWith('|');
const isSep = (l) => /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(l.trim());
const cells = (l) =>
  l
    .trim()
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
const BLOCK_START = /^(```|\\\[|\$\$|#{1,4}\s|\s*[-*]\s+|\s*\d+\.\s+|>\s?)/;

export function parseBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let i = 0;
  const take = (test, strip) => {
    const items = [];
    while (i < lines.length && test(lines[i])) items.push(strip(lines[i++]));
    return items;
  };
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const fence = trimmed.match(/^```(\w*)/);
    if (fence) {
      i++;
      const buf = take(
        (l) => !l.trim().startsWith('```'),
        (l) => l
      );
      i++;
      blocks.push({ type: fence[1].toLowerCase() === 'mermaid' ? 'mermaid' : 'code', content: buf.join('\n') });
      continue;
    }
    if (trimmed.startsWith('\\[') || trimmed.startsWith('$$')) {
      const close = trimmed.startsWith('\\[') ? '\\]' : '$$';
      if (trimmed.length > 4 && trimmed.endsWith(close)) {
        blocks.push({ type: 'math', content: trimmed.slice(2, -2) });
        i++;
        continue;
      }
      const buf = [trimmed.slice(2)];
      i++;
      while (i < lines.length && !lines[i].includes(close)) buf.push(lines[i++]);
      if (i < lines.length) buf.push(lines[i++].split(close)[0]);
      blocks.push({ type: 'math', content: buf.join('\n') });
      continue;
    }
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      blocks.push({ type: 'table', head, rows: take(isRow, cells) });
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, content: heading[2] });
      i++;
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      blocks.push({
        type: 'quote',
        content: take(
          (l) => /^\s*>/.test(l),
          (l) => l.replace(/^\s*>\s?/, '')
        ).join(' '),
      });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      blocks.push({
        type: 'ul',
        items: take(
          (l) => /^\s*[-*]\s+/.test(l),
          (l) => l.replace(/^\s*[-*]\s+/, '')
        ),
      });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      blocks.push({
        type: 'ol',
        items: take(
          (l) => /^\s*\d+\.\s+/.test(l),
          (l) => l.replace(/^\s*\d+\.\s+/, '')
        ),
      });
      continue;
    }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BLOCK_START.test(lines[i]) &&
      !(isRow(lines[i]) && isSep(lines[i + 1] ?? ''))
    ) {
      para.push(lines[i++].trim());
    }
    // A line like "# " looks like a block start but no block takes it; keep it as text so the loop moves on.
    if (!para.length) para.push(lines[i++].trim());
    blocks.push({ type: 'p', content: para.join(' ') });
  }
  return blocks;
}

const CODE_CELL = /^([A-Z]{3}\d{5})\b\s*(.*)$/;
const PCT = /^(\d{1,3}(?:\.\d+)?)\s*%$/;
const SWATCH = ['var(--chart-3)', 'var(--chart-1)', 'var(--chart-2)'];

function Cell({ text, first }) {
  const m = first && CODE_CELL.exec(text);
  if (m) {
    return (
      <span className="md-unit">
        <UnitCode code={m[1]} />
        {m[2] && <span className="md-unit__name">{renderInline(m[2])}</span>}
      </span>
    );
  }
  return renderInline(text);
}

// A table with a percentage column also gets a "share of the final mark" bar.
function Table({ head, rows }) {
  const col = head.findIndex((h, c) => /weight|%/i.test(h) && rows.every((r) => PCT.test(r[c] ?? '')));
  const shares = col >= 0 ? rows.map((r) => Number(PCT.exec(r[col])[1])) : null;
  const showShare = shares && Math.abs(shares.reduce((a, b) => a + b, 0) - 100) < 0.5;
  return (
    <div className="md-table">
      <div className="md-table__scroll">
        <table>
          <thead>
            <tr>
              {head.map((h, c) => (
                <th key={c} scope="col">
                  {renderInline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, c) => (
                  <td key={c} className={c === col ? 'md-table__num' : undefined} data-label={head[c]}>
                    {c === 0 && showShare && (
                      <span className="swatch" style={{ background: SWATCH[ri % 3] }} aria-hidden="true" />
                    )}
                    <Cell text={cell} first={c === 0} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showShare && (
        <figure className="share">
          <figcaption>Share of the final mark</figcaption>
          <div className="share__bar">
            {rows.map((r, ri) => (
              <div key={ri} className="share__seg" style={{ flexGrow: shares[ri] }}>
                <span className="share__fill" style={{ background: SWATCH[ri % 3] }} />
                <span className="share__label">
                  {shares[ri]}% · {r[0].replace(/:.*$/, '')}
                </span>
              </div>
            ))}
          </div>
        </figure>
      )}
    </div>
  );
}

/**
 * @param unitStatus  code => { status, label } used to colour the prerequisite map
 * @param focus       the unit the question is about; highlighted in the map
 * @param mapCite     citation number of the requisites page, shown beside the map title
 */
export default function MarkdownContent({
  text,
  onCite,
  activeCite,
  unitStatus,
  focus,
  mapCite,
  citations = [],
  onCitationClick,
  onOpenDocumentViewer,
}) {
  const blocks = useMemo(() => parseBlocks(text || ''), [text]);
  const cite = useMemo(() => ({ onCite, active: activeCite }), [onCite, activeCite]);
  const handleCitation =
    onOpenDocumentViewer || onCitationClick
      ? (citIndex, citation) => {
          if (onOpenDocumentViewer && citation) onOpenDocumentViewer(citation, citIndex);
          else onCitationClick?.(citIndex);
        }
      : null;
  return (
    <CiteCtx.Provider value={cite}>
      <div className="md">
        {blocks.map((b, idx) => {
          switch (b.type) {
            case 'mermaid':
              return (
                <PrereqMap
                  key={idx}
                  code={b.content}
                  unitStatus={unitStatus}
                  focus={focus}
                  cite={mapCite ? <CiteRef n={mapCite} /> : null}
                />
              );
            case 'math':
              return (
                <div
                  key={idx}
                  className="md-math-block"
                  dangerouslySetInnerHTML={{ __html: renderMath(b.content, true) }}
                />
              );
            case 'code':
              return (
                <pre key={idx} className="md-code">
                  <code>{b.content}</code>
                </pre>
              );
            case 'table':
              return <Table key={idx} head={b.head} rows={b.rows} />;
            case 'heading': {
              const Tag = `h${Math.min(b.level + 1, 6)}`;
              return (
                <Tag key={idx} className={b.level <= 2 ? 't-h2' : 't-h3'}>
                  {renderInline(b.content, handleCitation, citations)}
                </Tag>
              );
            }
            case 'quote':
              return (
                <blockquote key={idx} className="quote">
                  {renderInline(b.content, handleCitation, citations)}
                </blockquote>
              );
            case 'ul':
            case 'ol': {
              const Tag = b.type;
              return (
                <Tag key={idx} className={`md-list md-list--${b.type}`}>
                  {b.items.map((item, ii) => (
                    <li key={ii}>{renderInline(item, handleCitation, citations)}</li>
                  ))}
                </Tag>
              );
            }
            default:
              return (
                <Fragment key={idx}>
                  <p className={idx === 0 ? 'md-lead' : undefined}>{renderInline(b.content, handleCitation, citations)}</p>
                </Fragment>
              );
          }
        })}
      </div>
    </CiteCtx.Provider>
  );
}
