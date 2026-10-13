import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  FileJson,
  GitCompareArrows,
  Info,
  Plus,
  Trash2,
  TriangleAlert,
  Bookmark,
} from 'lucide-react';
import { PlanTree } from './components/PlanTree';
import { NodeDetails } from './components/NodeDetails';
import { ImportDialog } from './components/ImportDialog';
import {
  analyzePlan,
  comparePlans,
  formatNumber,
  markdownReport,
  metric,
  parsePlan,
} from './lib/plan';
import type { Delta, ParsedPlan } from './lib/plan';
import { readSaved, writeSaved } from './lib/storage';
import type { SavedAnalysis } from './lib/storage';
import { baselineSample, optimizedSample, estimatedSample, capturedSource } from './data/samples';
import setupSql from '../demo/setup.sql?raw';
interface Analysis {
  name: string;
  input: string;
  source: string;
}
type View = 'analyze' | 'compare' | 'guide';
const baseline: Analysis = {
  name: 'Orders lookup · baseline',
  input: baselineSample,
  source: capturedSource,
};
const optimized: Analysis = {
  name: 'Orders lookup · indexed',
  input: optimizedSample,
  source: capturedSource,
};
const estimates: Analysis = {
  name: 'Orders lookup · estimates only',
  input: estimatedSample,
  source: 'Derived estimated-only example: actual measurements removed from captured plan',
};
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
function DeltaRow({
  title,
  value,
  suffix,
}: {
  title: string;
  value: Delta | null;
  suffix: string;
}) {
  return (
    <tr>
      <th scope="row">{title}</th>
      <td>{value ? formatNumber(value.before) + suffix : 'Not recorded'}</td>
      <td>{value ? formatNumber(value.after) + suffix : 'Not recorded'}</td>
      <td>
        {value
          ? value.percent === null
            ? `${formatNumber(value.change)}${suffix} · zero baseline`
            : `${formatNumber(Math.abs(value.percent))}% ${value.change < 0 ? 'lower' : value.change > 0 ? 'higher' : 'change'}`
          : 'Unavailable'}
      </td>
    </tr>
  );
}
function CompactPlan({ plan, name }: { plan: ParsedPlan; name: string }) {
  return (
    <section className="compact-plan">
      <div className="panel-heading">
        <h3>{name}</h3>
        <span>{plan.nodes.length} operations</span>
      </div>
      <ol>
        {plan.nodes.map((node) => (
          <li key={node.id} style={{ paddingLeft: `${12 + Math.min(node.depth, 10) * 18}px` }}>
            <span className="compact-node-id">{node.id}</span>
            <span className="compact-operation">
              <strong>{node.type}</strong>
              <small>{node.relation ?? node.index ?? '—'}</small>
            </span>
            <span className="compact-time">
              {node.actualTime === undefined
                ? `${formatNumber(node.totalCost)} cost`
                : metric(node.cumulativeTime, ' ms')}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
export default function App() {
  const [analysis, setAnalysis] = useState<Analysis>(baseline);
  const [comparison, setComparison] = useState<Analysis>(optimized);
  const [view, setView] = useState<View>('analyze');
  const [selectedId, setSelectedId] = useState('1.1.1');
  const [importMode, setImportMode] = useState<'baseline' | 'comparison' | null>(null);
  const [saved, setSaved] = useState<SavedAnalysis[]>(readSaved);
  const [notice, setNotice] = useState('');
  const [activeSample, setActiveSample] = useState('baseline');
  const plan = useMemo(() => parsePlan(analysis.input), [analysis.input]);
  const comparedPlan = useMemo(() => parsePlan(comparison.input), [comparison.input]);
  const insights = useMemo(() => analyzePlan(plan), [plan]);
  const warningCount = insights.filter((insight) => insight.kind === 'warning').length;
  const selected = plan.nodes.find((node) => node.id === selectedId) ?? plan.root;
  const differences = useMemo(() => comparePlans(plan, comparedPlan), [plan, comparedPlan]);
  const openAnalysis = (next: Analysis, sample = '') => {
    setAnalysis(next);
    setSelectedId('1');
    setActiveSample(sample);
    setNotice('');
    setView('analyze');
  };
  const persist = (next: SavedAnalysis[]) => {
    try {
      writeSaved(next);
      setSaved(next);
      return true;
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Unable to save.');
      return false;
    }
  };
  const save = () => {
    const existing = saved.find(
      (item) => item.input === analysis.input && item.name === analysis.name,
    );
    if (existing) {
      setNotice('This analysis is already saved in your browser.');
      return;
    }
    if (saved.length >= 20) {
      setNotice('Library is full (20 analyses). Delete an analysis before saving another.');
      return;
    }
    if (
      persist([
        { id: crypto.randomUUID(), ...analysis, savedAt: new Date().toISOString() },
        ...saved,
      ])
    )
      setNotice('Analysis saved in this browser.');
  };
  const exportReport = () => {
    download(
      'planscope-report.md',
      markdownReport(
        analysis.name,
        plan,
        analysis.source,
        view === 'compare'
          ? { name: comparison.name, plan: comparedPlan, source: comparison.source }
          : undefined,
      ),
      'text/markdown',
    );
    setNotice('Report exported as Markdown.');
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to analysis
      </a>
      <header className="app-header">
        <a
          className="app-name"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setView('analyze');
          }}
        >
          PlanScope
        </a>
        <span className="app-description">PostgreSQL EXPLAIN inspector</span>
        <nav aria-label="Main navigation">
          {(
            [
              { id: 'analyze', label: 'Execution plan' },
              { id: 'compare', label: 'Compare plans' },
              { id: 'guide', label: 'Capture instructions' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="workspace-layout">
        <aside className="library-panel" aria-label="Plan library">
          <section className="sample-library">
            <h2>Example plans</h2>
            <div className="sample-list">
              <button
                className={activeSample === 'baseline' ? 'sample-button selected' : 'sample-button'}
                onClick={() => openAnalysis(baseline, 'baseline')}
              >
                <FileJson size={14} /> Before index
              </button>
              <button
                className={activeSample === 'indexed' ? 'sample-button selected' : 'sample-button'}
                onClick={() => openAnalysis(optimized, 'indexed')}
              >
                <FileJson size={14} /> After index
              </button>
              <button
                className={
                  activeSample === 'estimates' ? 'sample-button selected' : 'sample-button'
                }
                onClick={() => openAnalysis(estimates, 'estimates')}
              >
                <FileJson size={14} /> Estimates only
              </button>
            </div>
          </section>
          <section className="saved-library">
            <h2>
              Saved analyses <span>{saved.length}/20</span>
            </h2>
            <div className="saved-list">
              {saved.length ? (
                saved.map((item) => (
                  <div className="saved-item" key={item.id}>
                    <button className="saved-load" onClick={() => openAnalysis(item)}>
                      <FileJson size={14} />
                      <span>
                        {item.name}
                        <small>
                          {new Date(item.savedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </small>
                      </span>
                    </button>
                    <button
                      className="icon-button saved-delete"
                      aria-label={`Delete saved ${item.name}`}
                      onClick={() => {
                        if (persist(saved.filter((row) => row.id !== item.id)))
                          setNotice('Saved analysis deleted.');
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-library">No saved analyses.</p>
              )}
            </div>
          </section>
          <p className="library-note">Saved plans are stored in this browser.</p>
          <a
            className="documentation-link"
            href="https://www.postgresql.org/docs/current/using-explain.html"
            target="_blank"
            rel="noreferrer"
          >
            PostgreSQL documentation <ArrowUpRight size={13} />
          </a>
        </aside>
        <main id="main-content">
          <div className="page-heading">
            <h1>
              {view === 'compare'
                ? 'Compare plans'
                : view === 'guide'
                  ? 'Capture instructions'
                  : 'Execution plan'}
            </h1>
            <button
              className="primary-button"
              onClick={() => setImportMode(view === 'compare' ? 'comparison' : 'baseline')}
            >
              <Plus size={15} /> Import {view === 'compare' ? 'comparison' : 'plan'}
            </button>
          </div>
          {notice ? (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                ×
              </button>
            </div>
          ) : null}
          {view === 'guide' ? (
            <div className="guide-content">
              <section className="guide-panel">
                <h2>Export a PostgreSQL plan</h2>
                <p>
                  Run this in your PostgreSQL client and save the JSON output. ANALYZE executes the
                  SQL statement; use a read-only query you understand.
                </p>
                <pre>
                  {
                    "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)\nSELECT id, total, created_at\nFROM planscope_orders\nWHERE customer_id = 4242 AND status = 'paid'\nORDER BY created_at DESC\nLIMIT 20;"
                  }
                </pre>
                <p>
                  Use <code>EXPLAIN (FORMAT JSON)</code> for estimates without execution. Add{' '}
                  <code>TIMING OFF</code> to an ANALYZE capture for row measurements without node
                  timings.
                </p>
                <button className="secondary-button" onClick={() => setImportMode('baseline')}>
                  I have a plan <ArrowRight size={14} />
                </button>
              </section>
              <section className="guide-panel">
                <h2>Reproduce the sample captures</h2>
                <p>
                  The sample uses 200,000 deterministic orders. A selective customer/status lookup
                  initially scans almost the whole table. A composite index changes the scan
                  strategy.
                </p>
                <pre>
                  {
                    'CREATE INDEX planscope_orders_lookup\nON planscope_orders\n(customer_id, status, created_at DESC);'
                  }
                </pre>
                <dl className="experiment-results">
                  <div>
                    <dt>Baseline execution</dt>
                    <dd>21.659 ms</dd>
                  </div>
                  <div>
                    <dt>Indexed execution</dt>
                    <dd>0.313 ms</dd>
                  </div>
                  <div>
                    <dt>Engine</dt>
                    <dd>PostgreSQL 18.6 / PGlite 0.5.9</dd>
                  </div>
                </dl>
                <p>
                  Single local captures, not a production benchmark. Compare repeated runs with
                  equivalent data, configuration, and cache conditions.
                </p>
                <button
                  className="secondary-button"
                  onClick={() => download('planscope-setup.sql', setupSql, 'text/plain')}
                >
                  Download experiment SQL <Download size={14} />
                </button>
              </section>
            </div>
          ) : (
            <>
              <section className="analysis-document" aria-label="Current analysis">
                <div className="document-heading">
                  <FileJson size={16} />
                  <h2>{analysis.name}</h2>
                  <div className="document-actions">
                    <button className="secondary-button" onClick={save}>
                      <Bookmark size={14} /> Save
                    </button>
                    <button className="secondary-button" onClick={exportReport}>
                      <Download size={14} /> Export report
                    </button>
                  </div>
                </div>
                <p className="document-source">{analysis.source}</p>
              </section>
              {view === 'analyze' ? (
                <>
                  <dl className="plan-summary" aria-label="Plan summary">
                    <div className="summary-stat execution">
                      <dt>Execution</dt>
                      <dd>
                        {plan.executionTime === undefined
                          ? 'Not recorded'
                          : `${formatNumber(plan.executionTime, 3)} ms`}
                      </dd>
                      {plan.executionTime === undefined ? (
                        <small>No execution timing recorded</small>
                      ) : null}
                    </div>
                    <div className="summary-stat">
                      <dt>Planning</dt>
                      <dd>{metric(plan.planningTime, ' ms')}</dd>
                    </div>
                    <div className="summary-stat">
                      <dt>Root cost</dt>
                      <dd>{formatNumber(plan.root.totalCost)} units</dd>
                    </div>
                    <div className="summary-stat">
                      <dt>Operations</dt>
                      <dd>
                        {plan.nodes.length}
                        {plan.parallel ? ' · parallel' : ''}
                      </dd>
                    </div>
                    <div className="summary-stat">
                      <dt>Review signals</dt>
                      <dd>
                        {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
                      </dd>
                    </div>
                  </dl>
                  <div className="explorer-grid">
                    <div className="explorer-left">
                      <PlanTree
                        key={analysis.input}
                        plan={plan}
                        selectedId={selected.id}
                        onSelect={setSelectedId}
                      />
                      <section className="signals-panel" aria-labelledby="signals-title">
                        <div className="panel-heading">
                          <h2 id="signals-title">Review signals</h2>
                          <span>{insights.length}</span>
                        </div>
                        {insights.length ? (
                          insights.map((insight, index) => (
                            <button
                              className={`insight ${insight.kind}`}
                              key={`${insight.nodeId}-${index}`}
                              onClick={() => setSelectedId(insight.nodeId)}
                            >
                              <span className="insight-symbol">
                                {insight.kind === 'warning' ? (
                                  <TriangleAlert size={15} />
                                ) : (
                                  <Info size={15} />
                                )}
                              </span>
                              <span>
                                <strong>
                                  {insight.title} <small>Node {insight.nodeId}</small>
                                </strong>
                                <p>{insight.message}</p>
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="no-signals">
                            No configured signals triggered. Inspect the operations and compare
                            repeated runs; this does not establish optimal performance.
                          </p>
                        )}
                      </section>
                    </div>
                    <NodeDetails node={selected} />
                  </div>
                </>
              ) : (
                <div className="comparison-view">
                  <section className="comparison-heading">
                    <div>
                      <span className="section-label">Comparison document</span>
                      <h2>{comparison.name}</h2>
                      <p>{comparison.source}</p>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        const old = analysis;
                        setAnalysis(comparison);
                        setComparison(old);
                        setSelectedId('1');
                        setActiveSample('');
                      }}
                    >
                      Swap plans <GitCompareArrows size={14} />
                    </button>
                  </section>
                  <div className="comparison-selector">
                    <label htmlFor="comparison-saved">Saved analysis</label>
                    <select
                      id="comparison-saved"
                      value=""
                      onChange={(event) => {
                        const item = saved.find((row) => row.id === event.target.value);
                        if (item) setComparison(item);
                      }}
                    >
                      <option value="" disabled>
                        Select from library…
                      </option>
                      {saved.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <button className="secondary-button" onClick={() => setComparison(optimized)}>
                      Use indexed sample
                    </button>
                  </div>
                  <div className="comparison-table-wrapper">
                    <table className="comparison-table">
                      <thead>
                        <tr>
                          <th>Measurement</th>
                          <th>Baseline</th>
                          <th>Comparison</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        <DeltaRow
                          title="Execution time"
                          value={differences.execution}
                          suffix=" ms"
                        />
                        <DeltaRow
                          title="Root estimated cost"
                          value={differences.cost}
                          suffix=" units"
                        />
                        <DeltaRow title="Operation count" value={differences.nodes} suffix="" />
                      </tbody>
                    </table>
                  </div>
                  {differences.outputRows && differences.outputRows.change !== 0 ? (
                    <p className="comparison-warning">
                      <TriangleAlert size={15} /> Root output counts differ. Verify equivalent
                      results before attributing the change to an optimization.
                    </p>
                  ) : null}
                  <div className="side-by-side">
                    <CompactPlan plan={plan} name="Baseline operations" />
                    <CompactPlan plan={comparedPlan} name="Comparison operations" />
                  </div>
                  <p className="comparison-caveat">
                    Comparison uses statement summaries and tree shapes. Costs are planner units;
                    timings depend on hardware, cache, data, and configuration. Corresponding nodes
                    are not assumed equivalent.
                  </p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {importMode ? (
        <ImportDialog
          mode={importMode}
          onClose={() => setImportMode(null)}
          onImport={(name, input) => {
            const next = { name, input, source: 'Imported JSON · provenance provided by you' };
            if (importMode === 'comparison') {
              setComparison(next);
              setView('compare');
            } else openAnalysis(next);
            setImportMode(null);
          }}
        />
      ) : null}
    </div>
  );
}
