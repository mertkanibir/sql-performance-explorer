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
    <aside className="node-details" aria-labelledby="node-details-heading">
      <div className="panel-heading">
        <h2 id="node-details-heading">Node properties</h2>
        <span className="node-id">{node.id}</span>
      </div>
      <div className="selected-operation">
        <h3>{node.type}</h3>
        <p>{node.relation ?? node.index ?? 'Query operation'}</p>
      </div>
      <dl className="property-table">
        <div>
          <dt>Time / loop</dt>
          <dd>{metric(node.actualTime, ' ms')}</dd>
        </div>
        <div>
          <dt>Actual loops</dt>
          <dd>{metric(node.loops)}</dd>
        </div>
        <div>
          <dt>Inclusive work</dt>
          <dd>{metric(node.cumulativeTime, ' ms')}</dd>
        </div>
        <div>
          <dt>Total output rows</dt>
          <dd>{metric(node.totalRows)}</dd>
        </div>
      </dl>
      <section className="property-section">
        <h4>Cardinality · rows per loop</h4>
        <dl className="property-table">
          <div>
            <dt>Estimated</dt>
            <dd>{formatNumber(node.estimatedRows)}</dd>
          </div>
          <div>
            <dt>Actual</dt>
            <dd>{metric(node.actualRows)}</dd>
          </div>
        </dl>
        <p
          className={
            error?.factor === null || (error?.factor ?? 1) >= 10
              ? 'estimate-warning'
              : 'estimate-label'
          }
        >
          {measurement}
        </p>
      </section>
      <section className="property-section">
        <h4>Planner cost</h4>
        <dl className="property-table">
          <div>
            <dt>Startup</dt>
            <dd>{formatNumber(node.startupCost)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatNumber(node.totalCost)}</dd>
          </div>
        </dl>
      </section>
      {conditions.length > 0 ? (
        <section className="property-section conditions">
          <h4>Predicates and ordering</h4>
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
        </section>
      ) : null}
      {buffers.length > 0 ? (
        <section className="property-section buffers">
          <h4>Buffers · inclusive counters</h4>
          <dl className="property-table">
            {buffers.map((key) => (
              <div key={key}>
                <dt>{key.replace(' Blocks', '')}</dt>
                <dd>{String(node.raw[key])}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <p className="detail-note">
        Costs use planner units. Timings include child operations; row totals across loops are
        approximate.
      </p>
      <details className="raw-details">
        <summary>Raw node JSON</summary>
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
