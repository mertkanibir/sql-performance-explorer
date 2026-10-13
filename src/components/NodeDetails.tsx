import { ArrowUpRight, Database, GitBranch, Info } from 'lucide-react';
import { estimateError, formatNumber, metric } from '../lib/plan';
import type { PlanNode } from '../lib/plan';
export function NodeDetails({ node }: { node: PlanNode }) {
  const error = estimateError(node);
  const conditions = [
    'Filter',
    'Index Cond',
    'Recheck Cond',
    'Hash Cond',
    'Merge Cond',
    'Join Filter',
    'Sort Key',
  ].filter((key) => node.raw[key] !== undefined);
  const buffers = [
    'Shared Hit Blocks',
    'Shared Read Blocks',
    'Temp Read Blocks',
    'Temp Written Blocks',
  ].filter((key) => node.raw[key] !== undefined);
  const measurement =
    node.loops === 0
      ? 'Never executed'
      : node.actualRows === undefined
        ? 'Estimates only'
        : error?.factor === null
          ? error.kind === 'zero-estimate'
            ? 'Zero estimated; rows returned'
            : 'Zero actual rows'
          : `${formatNumber(error?.factor ?? 1)}× estimation difference`;
  return (
    <aside className="panel node-details" aria-labelledby="node-details-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SELECTED OPERATION</p>
          <h2 id="node-details-heading">Node details</h2>
        </div>
        <span className="node-id">{node.id}</span>
      </div>
      <div className="selected-operation">
        <span className="detail-icon">
          {node.type.includes('Scan') ? <Database size={24} /> : <GitBranch size={24} />}
        </span>
        <div>
          <h3>{node.type}</h3>
          <p>{node.relation ?? node.index ?? 'Query operation'}</p>
        </div>
      </div>
      <div className="detail-grid">
        <div>
          <span>Time / loop</span>
          <strong>{metric(node.actualTime, ' ms')}</strong>
        </div>
        <div>
          <span>Actual loops</span>
          <strong>{metric(node.loops)}</strong>
        </div>
        <div>
          <span>Inclusive work</span>
          <strong>{metric(node.cumulativeTime, ' ms')}</strong>
        </div>
        <div>
          <span>Total output rows</span>
          <strong>{metric(node.totalRows)}</strong>
        </div>
      </div>
      <div className="estimate-block">
        <p className="eyebrow">CARDINALITY · ROWS PER LOOP</p>
        <div className="estimate-pair">
          <span>
            <small>Estimated</small>
            <strong>{formatNumber(node.estimatedRows)}</strong>
          </span>
          <ArrowUpRight size={20} />
          <span>
            <small>Actual</small>
            <strong>{metric(node.actualRows)}</strong>
          </span>
        </div>
        <p
          className={
            error?.factor === null || (error?.factor ?? 1) >= 10
              ? 'estimate-warning'
              : 'estimate-label'
          }
        >
          {measurement}
        </p>
      </div>
      <div className="cost-line">
        <span>Planner cost</span>
        <strong>
          {formatNumber(node.startupCost)} → {formatNumber(node.totalCost)}
        </strong>
      </div>
      {conditions.length > 0 ? (
        <div className="conditions">
          <p className="eyebrow">PREDICATES & ORDERING</p>
          {conditions.map((key) => (
            <div key={key}>
              <small>{key}</small>
              <pre>
                {Array.isArray(node.raw[key])
                  ? (node.raw[key] as unknown[]).join(', ')
                  : String(node.raw[key])}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
      {buffers.length > 0 ? (
        <div className="buffers">
          <p className="eyebrow">BUFFERS · INCLUSIVE COUNTERS</p>
          {buffers.map((key) => (
            <div key={key}>
              <span>{key.replace(' Blocks', '')}</span>
              <strong>{String(node.raw[key])}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <p className="detail-note">
        <Info size={14} /> Costs use planner units. Actual timings include child operations; rows
        across loops are approximate.
      </p>
      <details className="raw-details">
        <summary>View raw node JSON</summary>
        <pre>
          {JSON.stringify(
            Object.fromEntries(Object.entries(node.raw).filter(([key]) => key !== 'Plans')),
            null,
            2,
          )}
        </pre>
      </details>
    </aside>
  );
}
