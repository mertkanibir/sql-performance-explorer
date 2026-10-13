import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Database,
  ArrowRight,
  TriangleAlert,
} from 'lucide-react';
import { estimateError, formatNumber, metric } from '../lib/plan';
import type { ParsedPlan, PlanNode } from '../lib/plan';
interface Props {
  plan: ParsedPlan;
  selectedId: string;
  onSelect: (id: string) => void;
}
export function PlanTree({ plan, selectedId, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const visible: PlanNode[] = [];
  function visit(node: PlanNode) {
    visible.push(node);
    if (!collapsed.has(node.id)) node.children.forEach(visit);
  }
  visit(plan.root);
  const hasRecordedTime = plan.nodes.some((node) => node.cumulativeTime !== undefined);
  const largestValue = Math.max(
    ...plan.nodes.map((node) => (hasRecordedTime ? (node.cumulativeTime ?? 0) : node.totalCost)),
  );
  const toggle = (id: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <section className="panel tree-panel" aria-labelledby="tree-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">FOLLOW THE EXECUTION</p>
          <h2 id="tree-heading">Query plan</h2>
        </div>
        <button className="text-button" onClick={() => setCollapsed(new Set())}>
          Expand all <ChevronDown size={14} />
        </button>
      </div>
      <div
        className="tree-table"
        tabIndex={0}
        role="region"
        aria-label="Query plan table. Scroll horizontally on small screens."
      >
        <div className="tree-column-head">
          <span>OPERATION</span>
          <span>
            ROWS / LOOP <small>EST. → ACTUAL</small>
          </span>
          <span>
            {hasRecordedTime ? 'INCLUSIVE WORK' : 'ESTIMATED COST'}
            <small>{hasRecordedTime ? 'TIME × LOOPS' : 'PLANNER UNITS'}</small>
          </span>
        </div>
        <ul className="plan-nodes" aria-label="Execution plan operations">
          {visible.map((node) => {
            const error = estimateError(node);
            const flagged = error && (error.factor === null || error.factor >= 10);
            const value = hasRecordedTime ? (node.cumulativeTime ?? 0) : node.totalCost;
            const width = largestValue > 0 ? (value / largestValue) * 100 : 0;
            return (
              <li key={node.id} className={`plan-row ${selectedId === node.id ? 'selected' : ''}`}>
                <div
                  className="node-main"
                  style={{
                    paddingLeft: `${16 + Math.min(node.depth, 12) * 23}px`,
                  }}
                >
                  {node.children.length > 0 ? (
                    <button
                      className="collapse-button"
                      aria-label={`${collapsed.has(node.id) ? 'Expand' : 'Collapse'} ${node.type} node ${node.id}`}
                      aria-expanded={!collapsed.has(node.id)}
                      onClick={() => toggle(node.id)}
                    >
                      {collapsed.has(node.id) ? (
                        <ChevronRight size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                  ) : (
                    <span className="leaf-connector" />
                  )}
                  <button
                    className="node-select"
                    onClick={() => onSelect(node.id)}
                    aria-pressed={selectedId === node.id}
                    aria-label={`Inspect ${node.type} node ${node.id}`}
                  >
                    <span className={`node-icon ${node.type.includes('Scan') ? 'scan' : ''}`}>
                      {node.type.includes('Scan') ? (
                        <Database size={15} />
                      ) : (
                        <GitBranch size={15} />
                      )}
                    </span>
                    <span className="node-name">
                      <strong>{node.type}</strong>
                      <small>{node.relation ?? node.index ?? `Node ${node.id}`}</small>
                    </span>
                    {flagged ? <TriangleAlert size={14} className="warning-icon" /> : null}
                  </button>
                </div>
                <div className="row-estimate">
                  <span>{formatNumber(node.estimatedRows)}</span>
                  <ArrowRight size={12} />
                  <strong>
                    {node.loops === 0
                      ? 'Skipped'
                      : node.actualRows === undefined
                        ? '—'
                        : formatNumber(node.actualRows)}
                  </strong>
                </div>
                <div className="row-time">
                  <strong>
                    {hasRecordedTime
                      ? metric(node.cumulativeTime, ' ms')
                      : `${formatNumber(node.totalCost)} cost`}
                  </strong>
                  <span className="mini-track">
                    <span style={{ width: `${Math.min(width, 100)}%` }} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="tree-footnote">
        <span className="legend-dot" />{' '}
        {hasRecordedTime
          ? 'Bars compare inclusive node work. Timings overlap and must never be summed.'
          : 'Bars compare inclusive estimated node costs in planner units. Costs include descendants and must never be summed.'}
      </div>
    </section>
  );
}
