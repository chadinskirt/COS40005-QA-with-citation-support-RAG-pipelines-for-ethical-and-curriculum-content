import { Fragment, useMemo, useState } from 'react';
import Icon from './Icon.jsx';

// Parses a Mermaid flowchart (`flowchart LR`, `A["label"] --> B`, `-.->` for alternatives).
export function parseFlowchart(source) {
  const lines = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  const nodes = new Map();
  const edges = [];
  const node = (raw) => {
    const m = raw
      .trim()
      .replace(/;$/, '')
      .match(/^([A-Za-z0-9_-]+)\s*(?:\[\[?"?([^\]"]+)"?\]?\]|\(\(?"?([^)"]+)"?\)?\)|\{"?([^}"]+)"?\})?$/);
    if (!m) return null;
    const label = m[2] || m[3] || m[4];
    if (!nodes.has(m[1])) nodes.set(m[1], { id: m[1], label: label || m[1] });
    else if (label) nodes.get(m[1]).label = label;
    return m[1];
  };
  for (const line of lines.slice(/^(flowchart|graph)\b/i.test(lines[0] ?? '') ? 1 : 0)) {
    if (/^(subgraph|end|classDef|class|style|linkStyle|click)\b/i.test(line)) continue;
    const e = line.match(/^(.+?)\s*(-\.->|-->|==>|--\s*[^->]+\s*-->)\s*(?:\|[^|]*\|\s*)?(.+)$/);
    if (!e) {
      node(line);
      continue;
    }
    const [a, b] = [node(e[1]), node(e[3])];
    if (a && b) edges.push({ source: a, target: b, dashed: e[2].includes('.') });
  }
  return nodes.size ? { nodes: [...nodes.values()], edges } : null;
}

// Column = length of the longest chain of prerequisites before a node. Solid edges set the column when a
// node has any, so an alternative (dashed) unit stacks beside the unit it stands in for.
function layers({ nodes, edges }) {
  const depth = new Map();
  const visiting = new Set();
  const get = (id) => {
    if (depth.has(id)) return depth.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const incoming = edges.filter((e) => e.target === id);
    const solid = incoming.filter((e) => !e.dashed);
    const d = Math.max(-1, ...(solid.length ? solid : incoming).map((e) => get(e.source))) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  const cols = [];
  for (const n of nodes) (cols[get(n.id)] ??= []).push(n);
  return cols.filter(Boolean);
}

const split = (label, id) => {
  const name = label.replace(new RegExp(`^${id}\\s*[:·-]?\\s*`), '').trim();
  return name && name !== id ? name : null;
};

const ICON = { passed: 'checkCircle', retake: 'refresh', enrolled: 'checkCircle' };

// Figma: Prerequisite map. Cards are coloured from the student's own plan; the unit asked about is outlined.
export default function PrereqMap({ code, unitStatus, focus, cite }) {
  const [showSource, setShowSource] = useState(false);
  const graph = useMemo(() => parseFlowchart(code), [code]);
  const cols = useMemo(() => (graph ? layers(graph) : []), [graph]);
  const alt = graph
    ? graph.nodes.filter(
        (n) =>
          graph.edges.some((e) => e.target === n.id) &&
          graph.edges.filter((e) => e.target === n.id).every((e) => e.dashed)
      )
    : [];

  return (
    <figure className="pmap">
      <figcaption className="pmap__head">
        <span className="pmap__title">
          <Icon name="flow" size={15} />
          Prerequisite map
        </span>
        <span className="pmap__aside">
          {cite && <span className="c-muted">From the unit outline </span>}
          {cite}
          <button type="button" className="link-btn t-caption" onClick={() => setShowSource((v) => !v)}>
            {showSource ? 'Show map' : 'View source'}
          </button>
        </span>
      </figcaption>
      {!graph || showSource ? (
        <pre className="md-code">
          <code>{code}</code>
        </pre>
      ) : (
        <ol className="pmap__flow" aria-label="Prerequisites in order">
          {cols.map((col, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <li className="pmap__arrow" aria-hidden="true">
                  <Icon name="arrowRight" size={16} />
                </li>
              )}
              <li className="pmap__col">
                <ul>
                  {col.map((n) => {
                    const st = unitStatus?.(n.id) ?? {};
                    const kind = n.id === focus ? 'focus' : alt.includes(n) ? 'alt' : (st.status ?? 'none');
                    const name = split(n.label, n.id);
                    return (
                      <li key={n.id} className={`pnode pnode--${kind}`}>
                        <span className="pnode__code">{n.id}</span>
                        {name && <span className="pnode__name">{name}</span>}
                        {(st.label || kind === 'alt') && (
                          <span className="pnode__status">
                            {ICON[st.status] && <Icon name={ICON[st.status]} size={12} />}
                            {kind === 'alt' && !st.label ? 'Also meets the prerequisite' : st.label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            </Fragment>
          ))}
        </ol>
      )}
      {graph && !showSource && alt.length > 0 && (
        <p className="pmap__legend">
          <span className="pmap__line" aria-hidden="true" /> Your planned path
          <span className="pmap__line pmap__line--dashed" aria-hidden="true" /> Alternative:{' '}
          {alt.map((n) => n.id).join(', ')} also meets the prerequisite
        </p>
      )}
    </figure>
  );
}
