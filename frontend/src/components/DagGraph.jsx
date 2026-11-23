import { useMemo, useState } from 'react';

const STATUS_META = {
  passed: {
    label: 'Passed',
    fill: 'var(--status-passed-bg)',
    stroke: 'var(--status-passed-border)',
    text: 'var(--status-passed-text)',
  },
  enrolled: {
    label: 'Enrolled',
    fill: 'var(--status-enrolled-bg)',
    stroke: 'var(--status-enrolled-border)',
    text: 'var(--status-enrolled-text)',
  },
  retake: {
    label: 'Retake Required',
    fill: 'var(--status-retake-bg)',
    stroke: 'var(--status-retake-border)',
    text: 'var(--status-retake-text)',
  },
  planned: {
    label: 'Planned',
    fill: 'var(--status-planned-bg)',
    stroke: 'var(--status-planned-border)',
    text: 'var(--status-planned-text)',
  },
  blocked: {
    label: 'Blocked',
    fill: 'var(--status-blocked-bg)',
    stroke: 'var(--status-blocked-border)',
    text: 'var(--status-blocked-text)',
  },
};

const NODE_W = 192;
const NODE_H = 56;
const COL_GAP = 72;
const ROW_GAP = 18;
const PAD = 24;

function computeLayout(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));

  for (const e of edges) {
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      outgoing.get(e.source).push(e.target);
      incoming.get(e.target).push(e.source);
    }
  }

  // Longest-path topological layering with cycle guard.
  const depth = new Map();
  const visiting = new Set();
  function getDepth(id) {
    if (depth.has(id)) return depth.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const preds = incoming.get(id) ?? [];
    const d = preds.length === 0 ? 0 : Math.max(...preds.map((p) => getDepth(p) + 1));
    visiting.delete(id);
    depth.set(id, d);
    return d;
  }
  for (const n of nodes) getDepth(n.id);

  const columns = new Map();
  for (const n of nodes) {
    const col = depth.get(n.id) ?? 0;
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col).push(n);
  }

  const maxCol = Math.max(0, ...columns.keys());
  let maxRows = 1;
  const positions = new Map();

  for (let c = 0; c <= maxCol; c++) {
    const list = columns.get(c) ?? [];
    maxRows = Math.max(maxRows, list.length);
    list.forEach((n, r) => {
      positions.set(n.id, {
        x: PAD + c * (NODE_W + COL_GAP),
        y: PAD + r * (NODE_H + ROW_GAP),
      });
    });
  }

  const width = PAD * 2 + (maxCol + 1) * NODE_W + maxCol * COL_GAP;
  const height = PAD * 2 + maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP;
  return { positions, width, height, incoming, outgoing };
}

function splitLabel(node) {
  const raw = node.label || node.id;
  const parts = raw.split(/\s*[·:]\s*/);
  if (parts.length >= 2) {
    return { code: parts[0], title: parts.slice(1).join(' · ') };
  }
  return { code: node.id, title: raw === node.id ? '' : raw };
}

function truncate(str, max = 24) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/** Color-coded prerequisite DAG visualization for dag_graph. */
export default function DagGraph({ graph }) {
  const [activeId, setActiveId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const edges = useMemo(() => graph?.edges ?? [], [graph]);

  const layout = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);

  if (nodes.length === 0) {
    return (
      <div className="card">
        <h3 className="t-h2">Prerequisite graph</h3>
        <p className="t-small c-secondary">No prerequisite graph data available for this plan.</p>
      </div>
    );
  }

  const activeNode = activeId ? nodes.find((n) => n.id === activeId) : null;
  const activeConnected = new Set();
  if (activeId) {
    activeConnected.add(activeId);
    for (const e of edges) {
      if (e.source === activeId) activeConnected.add(e.target);
      if (e.target === activeId) activeConnected.add(e.source);
    }
  }

  return (
    <section className="card dag-card" aria-label="Prerequisite dependency graph">
      <div className="row between wrap gap-3">
        <div>
          <h3 className="t-h2">Prerequisite graph</h3>
          <p className="t-small c-secondary">Click any unit node to highlight its prerequisites and unlocked units.</p>
        </div>
        <div className="row wrap gap-3">
          <div className="dag-legend" aria-label="Graph status legend">
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <span key={key} className="dag-legend__item t-caption">
                <span
                  className="dag-legend__swatch"
                  style={{ backgroundColor: meta.fill, borderColor: meta.stroke }}
                  aria-hidden="true"
                />
                {meta.label}
              </span>
            ))}
          </div>
          <div className="dag-zoom" role="group" aria-label="Graph zoom controls">
            <button
              type="button"
              className="dag-zoom__btn t-caption t-mono"
              aria-label="Zoom out"
              disabled={zoom <= 0.7}
              onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))}
            >
              −
            </button>
            <button
              type="button"
              className="dag-zoom__btn t-caption t-mono"
              aria-label="Reset zoom"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="dag-zoom__btn t-caption t-mono"
              aria-label="Zoom in"
              disabled={zoom >= 1.45}
              onClick={() => setZoom((z) => Math.min(1.45, Number((z + 0.15).toFixed(2))))}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="dag-scroll">
        <svg
          className="dag-svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={Math.round(layout.width * zoom)}
          height={Math.round(layout.height * zoom)}
          role="img"
          aria-label={`Prerequisite graph with ${nodes.length} units and ${edges.length} dependencies`}
        >
          <defs>
            <marker id="dag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--color-border-strong)" />
            </marker>
            <marker
              id="dag-arrow-active"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent)" />
            </marker>
          </defs>

          {edges.map((e, idx) => {
            const from = layout.positions.get(e.source);
            const to = layout.positions.get(e.target);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const dx = Math.max(24, Math.abs(x2 - x1) * 0.45);
            const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            const isHighlighted = activeId && (e.source === activeId || e.target === activeId);
            const isDimmed = activeId && !isHighlighted;
            const isDashed = e.rule_type && e.rule_type.toLowerCase() !== 'prereq' && e.rule_type.toLowerCase() !== 'and';

            return (
              <path
                key={`${e.source}-${e.target}-${idx}`}
                d={d}
                fill="none"
                stroke={isHighlighted ? 'var(--accent)' : 'var(--color-border-strong)'}
                strokeWidth={isHighlighted ? 2.2 : 1.5}
                strokeDasharray={isDashed ? '5 4' : undefined}
                opacity={isDimmed ? 0.25 : 0.9}
                markerEnd={isHighlighted ? 'url(#dag-arrow-active)' : 'url(#dag-arrow)'}
              >
                <title>{`${e.source} → ${e.target}${e.rule_type ? ` (${e.rule_type})` : ''}`}</title>
              </path>
            );
          })}

          {nodes.map((n) => {
            const pos = layout.positions.get(n.id);
            if (!pos) return null;
            const meta = STATUS_META[n.status] ?? STATUS_META.planned;
            const { code, title } = splitLabel(n);
            const isSelected = activeId === n.id;
            const isDimmed = activeId && !activeConnected.has(n.id);

            return (
              <g
                key={n.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="dag-node"
                opacity={isDimmed ? 0.35 : 1}
                onClick={() => setActiveId((prev) => (prev === n.id ? null : n.id))}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                aria-label={`${code}${title ? ` ${title}` : ''}, status ${meta.label}`}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    setActiveId((prev) => (prev === n.id ? null : n.id));
                  }
                }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={meta.fill}
                  stroke={isSelected ? 'var(--text-primary)' : meta.stroke}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
                <text
                  x={12}
                  y={22}
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="var(--font-mono)"
                  fill={meta.text}
                >
                  {code}
                </text>
                <text x={NODE_W - 12} y={22} fontSize="10" fontWeight="600" textAnchor="end" fill={meta.text}>
                  {meta.label}
                </text>
                {title && (
                  <text x={12} y={40} fontSize="12" fontWeight="500" fill="var(--text-primary)">
                    {truncate(title, 25)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {activeNode && (
        <div className="dag-detail t-small">
          <strong>{activeNode.label || activeNode.id}</strong> ·{' '}
          <span className="c-secondary">
            Status: {(STATUS_META[activeNode.status] ?? STATUS_META.planned).label}
          </span>
          {(layout.incoming.get(activeNode.id)?.length ?? 0) > 0 && (
            <span className="c-secondary"> · Requires: {layout.incoming.get(activeNode.id).join(', ')}</span>
          )}
          {(layout.outgoing.get(activeNode.id)?.length ?? 0) > 0 && (
            <span className="c-secondary"> · Unlocks: {layout.outgoing.get(activeNode.id).join(', ')}</span>
          )}
        </div>
      )}
    </section>
  );
}
