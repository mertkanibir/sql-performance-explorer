import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Download,
  FileJson,
  FolderOpen,
  GitCompareArrows,
  GitBranch,
  Info,
  LockKeyhole,
  Plus,
  ScanLine,
  Settings2,
  ShieldCheck,
  Timer,
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
function DeltaCard({
  title,
  value,
  suffix,
}: {
  title: string;
  value: Delta | null;
  suffix: string;
}) {
  const lower = value && value.change < 0;
  return (
    <div className="delta-card">
      <p className="eyebrow">{title}</p>
      <div className="delta-values">
        <span>{value ? formatNumber(value.before) : '—'}</span>
        <ArrowRight size={20} />
        <strong>
          {value ? formatNumber(value.after) : '—'}
          <small>{suffix}</small>
        </strong>
      </div>
      <p className={value ? (lower ? 'delta-good' : value.change > 0 ? 'delta-bad' : '') : 'muted'}>
        {value ? (
          <>
            {lower ? (
              <ArrowDownRight size={16} />
            ) : value.change > 0 ? (
              <ArrowUpRight size={16} />
            ) : (
              <Check size={16} />
            )}
            {value.percent === null
              ? `${formatNumber(value.change)}${suffix} change · zero baseline`
              : `${formatNumber(Math.abs(value.percent))}% ${lower ? 'lower' : value.change > 0 ? 'higher' : 'change'}`}
          </>
        ) : (
          'Both plans need this measurement'
        )}
      </p>
    </div>
  );
}
function CompactPlan({ plan, name }: { plan: ParsedPlan; name: string }) {
  return (
    <section className="compact-plan">
      <div className="compact-plan-title">
        <span className="legend-dot" />
        <h3>{name}</h3>
        <small>{plan.nodes.length} nodes</small>
      </div>
      <ol>
        {plan.nodes.map((node) => (
          <li key={node.id} style={{ paddingLeft: `${18 + Math.min(node.depth, 10) * 20}px` }}>
            <span className="compact-node-mark" />
            <span>
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
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView('analyze');
          }}
          aria-label="PlanScope home"
        >
          <span className="brand-symbol">
            <ScanLine size={23} />
          </span>
          <span>
            PlanScope<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <DatabaseIcon />
          </span>
          <div>
            <strong>Local workspace</strong>
            <small>PostgreSQL explorer</small>
          </div>
          <span className="status-dot" />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          <button
            className={view === 'analyze' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('analyze')}
          >
            <GitBranch size={18} /> Plan explorer <ChevronRight size={15} />
          </button>
          <button
            className={view === 'compare' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('compare')}
          >
            <GitCompareArrows size={18} /> Compare plans <span className="nav-pill">2</span>
          </button>
          <button
            className={view === 'guide' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('guide')}
          >
            <Code2 size={18} /> Capture guide
          </button>
        </nav>
        <div className="library-heading">
          <p className="nav-label">SAVED ANALYSES</p>
          <span>{saved.length}/20</span>
        </div>
        <div className="saved-list">
          {saved.length ? (
            saved.map((item) => (
              <div className="saved-item" key={item.id}>
                <button className="saved-load" onClick={() => openAnalysis(item)}>
                  <FileJson size={16} />
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
                  className="saved-delete"
                  aria-label={`Delete saved ${item.name}`}
                  onClick={() => {
                    if (persist(saved.filter((row) => row.id !== item.id)))
                      setNotice('Saved analysis deleted.');
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          ) : (
            <div className="empty-library">
              <FolderOpen size={23} />
              <p>Keep a useful plan close.</p>
              <small>Save an analysis to revisit it here.</small>
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-badge">
            <LockKeyhole size={16} />
            <div>
              <strong>Private by design</strong>
              <small>Plans stay in your browser.</small>
            </div>
          </div>
          <a
            href="https://www.postgresql.org/docs/current/using-explain.html"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={16} /> PostgreSQL EXPLAIN docs <ArrowUpRight size={14} />
          </a>
          <div className="build-label">
            BUILT FOR CURIOUS ENGINEERS <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>
              {view === 'compare'
                ? 'Compare plans'
                : view === 'guide'
                  ? 'Capture guide'
                  : 'Plan explorer'}
            </strong>
          </div>
          <span className="local-badge">
            <span className="status-dot" /> LOCAL ANALYSIS
          </span>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                <span /> DATABASE PERFORMANCE, MADE VISIBLE
              </p>
              <h1>
                {view === 'compare'
                  ? 'See what changed.'
                  : view === 'guide'
                    ? 'Start with a real plan.'
                    : 'Every query has a story.'}
              </h1>
              <p>
                {view === 'compare'
                  ? 'Put an optimization to the test, one execution plan at a time.'
                  : view === 'guide'
                    ? 'Capture PostgreSQL output, then bring it here to explore.'
                    : 'Follow the plan. Find the friction. Make the next run better.'}
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => setImportMode(view === 'compare' ? 'comparison' : 'baseline')}
            >
              <Plus size={18} /> Import {view === 'compare' ? 'comparison' : 'plan'}
            </button>
          </div>
          {notice ? (
            <div className="notice" role="status">
              <Check size={16} />
              <span>{notice}</span>
              <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                ×
              </button>
            </div>
          ) : null}
          {view === 'guide' ? (
            <div className="guide-content">
              <section className="panel guide-panel">
                <p className="eyebrow">01 / CAPTURE</p>
                <h2>Export the query’s execution plan</h2>
                <p>
                  Run this in your own PostgreSQL client, and save the JSON output. The ANALYZE
                  option executes your SQL, so begin with a read-only query you understand.
                </p>
                <pre>
                  {
                    "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)\nSELECT id, total, created_at\nFROM planscope_orders\nWHERE customer_id = 4242 AND status = 'paid'\nORDER BY created_at DESC\nLIMIT 20;"
                  }
                </pre>
                <p>
                  For estimates without execution, use <code>EXPLAIN (FORMAT JSON)</code>. For row
                  measurements without timing overhead, add <code>TIMING OFF</code> to an ANALYZE
                  capture.
                </p>
                <button className="secondary-button" onClick={() => setImportMode('baseline')}>
                  I have a plan <ArrowRight size={16} />
                </button>
              </section>
              <section className="panel guide-panel">
                <p className="eyebrow">02 / REPRODUCE</p>
                <h2>The orders lookup experiment</h2>
                <p>
                  Our example uses a deterministic set of 200,000 orders. A customer/status lookup
                  filters almost the entire table; adding a composite index changes the scan
                  strategy.
                </p>
                <pre>
                  {
                    'CREATE INDEX planscope_orders_lookup\nON planscope_orders\n(customer_id, status, created_at DESC);'
                  }
                </pre>
                <div className="guide-result">
                  <Timer size={20} />
                  <span>
                    <strong>21.659 ms → 0.313 ms</strong>
                    <small>Single local captures · PostgreSQL 18.6 / PGlite 0.5.9</small>
                  </span>
                </div>
                <p>
                  These are observed captures, not a production benchmark. Repeat equivalent queries
                  on the same dataset and cache state to evaluate a change.
                </p>
                <button
                  className="secondary-button"
                  onClick={() => download('planscope-setup.sql', setupSql, 'text/plain')}
                >
                  Download experiment SQL <Download size={16} />
                </button>
              </section>
            </div>
          ) : (
            <>
              <section className="source-bar" aria-label="Current analysis">
                <span className="source-icon">
                  <FileJson size={20} />
                </span>
                <div>
                  <h2>{analysis.name}</h2>
                  <p>{analysis.source}</p>
                </div>
                <button className="text-button" onClick={save}>
                  <Bookmark size={15} /> Save
                </button>
                <button className="text-button" onClick={exportReport}>
                  <Download size={15} /> Export report
                </button>
              </section>
              <div className="sample-bar">
                <div>
                  <span className="sample-label">TRY A PLAN</span>
                  <button
                    className={
                      activeSample === 'baseline' ? 'sample-button selected' : 'sample-button'
                    }
                    onClick={() => openAnalysis(baseline, 'baseline')}
                  >
                    Before index
                  </button>
                  <button
                    className={
                      activeSample === 'indexed' ? 'sample-button selected' : 'sample-button'
                    }
                    onClick={() => openAnalysis(optimized, 'indexed')}
                  >
                    After index
                  </button>
                  <button
                    className={
                      activeSample === 'estimates' ? 'sample-button selected' : 'sample-button'
                    }
                    onClick={() => openAnalysis(estimates, 'estimates')}
                  >
                    Estimates only
                  </button>
                </div>
                <span className="capture-note">
                  <Info size={13} /> Actual local captures; timings vary.
                </span>
              </div>
              {view === 'analyze' ? (
                <>
                  <section className="metrics" aria-label="Plan summary">
                    <div className="metric-tile execution">
                      <span className="metric-label">
                        <Timer size={16} /> EXECUTION TIME
                      </span>
                      <strong>
                        {plan.executionTime === undefined
                          ? '—'
                          : formatNumber(plan.executionTime, 3)}
                        <small>ms</small>
                      </strong>
                      <p>
                        {plan.executionTime === undefined
                          ? 'No execution timing recorded'
                          : 'Statement duration from EXPLAIN'}
                      </p>
                      <Activity className="tile-watermark" size={76} />
                    </div>
                    <div className="metric-tile">
                      <span className="metric-label">
                        <Settings2 size={16} /> PLANNER COST
                      </span>
                      <strong>
                        {formatNumber(plan.root.totalCost)}
                        <small>units</small>
                      </strong>
                      <p>Root cost · inclusive of descendants</p>
                    </div>
                    <div className="metric-tile">
                      <span className="metric-label">
                        <GitBranch size={16} /> PLAN OPERATIONS
                      </span>
                      <strong>
                        {plan.nodes.length}
                        <small>nodes</small>
                      </strong>
                      <p>
                        {plan.parallel
                          ? 'Parallel workers · overlapping work'
                          : 'Sequential tree · follow each operation'}
                      </p>
                    </div>
                    <div className="metric-tile signal-tile">
                      <span className="metric-label">
                        <ScanLine size={16} /> REVIEW SIGNALS
                      </span>
                      <strong>
                        {insights.filter((i) => i.kind === 'warning').length}
                        <small>to inspect</small>
                      </strong>
                      <p>
                        {plan.analyzed
                          ? 'Deterministic heuristics, not diagnoses'
                          : 'Estimates only · no actual row data'}
                      </p>
                    </div>
                  </section>
                  <div className="explorer-grid">
                    <div className="explorer-left">
                      <PlanTree
                        key={analysis.input}
                        plan={plan}
                        selectedId={selected.id}
                        onSelect={setSelectedId}
                      />
                      <section className="signals-panel" aria-labelledby="signals-title">
                        <div className="section-heading">
                          <h2 id="signals-title">
                            <ScanLine size={18} /> A closer look
                          </h2>
                          <span>{insights.length} signals</span>
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
                                  <TriangleAlert size={17} />
                                ) : (
                                  <Info size={17} />
                                )}
                              </span>
                              <span>
                                <strong>
                                  {insight.title} <small>NODE {insight.nodeId}</small>
                                </strong>
                                <p>{insight.message}</p>
                              </span>
                              <ChevronRight size={16} />
                            </button>
                          ))
                        ) : (
                          <div className="no-signals">
                            <ShieldCheck size={22} />
                            <div>
                              <strong>No configured signals triggered.</strong>
                              <p>
                                Inspect the operations and compare repeated runs; this doesn’t
                                establish optimal performance.
                              </p>
                            </div>
                          </div>
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
                      <p className="eyebrow">BASELINE → COMPARISON</p>
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
                      Swap plans <GitCompareArrows size={16} />
                    </button>
                  </section>
                  <div className="comparison-selector">
                    <label htmlFor="comparison-saved">Compare against saved analysis</label>
                    <select
                      id="comparison-saved"
                      value=""
                      onChange={(e) => {
                        const item = saved.find((row) => row.id === e.target.value);
                        if (item) setComparison(item);
                      }}
                    >
                      <option value="" disabled>
                        Select from your library…
                      </option>
                      {saved.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <button className="text-button" onClick={() => setComparison(optimized)}>
                      Use indexed sample <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="delta-grid">
                    <DeltaCard title="EXECUTION TIME" value={differences.execution} suffix=" ms" />
                    <DeltaCard
                      title="ROOT ESTIMATED COST"
                      value={differences.cost}
                      suffix=" units"
                    />
                    <DeltaCard title="PLAN NODE COUNT" value={differences.nodes} suffix=" nodes" />
                  </div>
                  {differences.outputRows && differences.outputRows.change !== 0 ? (
                    <div className="comparison-warning">
                      <TriangleAlert size={17} /> The root output row counts differ. Verify both
                      queries return equivalent results before attributing the change to an
                      optimization.
                    </div>
                  ) : null}
                  <div className="side-by-side">
                    <CompactPlan plan={plan} name="Baseline" />
                    <CompactPlan plan={comparedPlan} name="Comparison" />
                  </div>
                  <p className="comparison-caveat">
                    <Info size={16} /> This compares statement summaries and tree shapes, without
                    assuming corresponding nodes are equivalent. Costs are planner units; timings
                    depend on hardware, cache, data, and configuration.
                  </p>
                </div>
              )}
              <footer className="content-footer">
                <span>
                  <LockKeyhole size={13} /> Local analysis. No database connection required.
                </span>
                <span>
                  PostgreSQL JSON <span className="footer-dot">·</span> Deterministic insights
                </span>
              </footer>
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
function DatabaseIcon() {
  return <Activity size={18} />;
}
import setupSql from '../demo/setup.sql?raw';
