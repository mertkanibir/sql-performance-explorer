/** PostgreSQL EXPLAIN metrics are inclusive. Actual rows/timings are per-loop averages. */
export type RawRecord = Record<string, unknown>;
export interface PlanNode {
  id: string;
  depth: number;
  type: string;
  relation?: string;
  index?: string;
  estimatedRows: number;
  startupCost: number;
  totalCost: number;
  actualRows?: number;
  loops?: number;
  actualTime?: number;
  cumulativeTime?: number;
  totalRows?: number;
  raw: RawRecord;
  children: PlanNode[];
}
export interface ParsedPlan {
  root: PlanNode;
  nodes: PlanNode[];
  executionTime?: number;
  planningTime?: number;
  analyzed: boolean;
  parallel: boolean;
  document: RawRecord;
}
export interface Insight {
  nodeId: string;
  kind: 'warning' | 'info';
  title: string;
  message: string;
}
export interface EstimateError {
  factor: number | null;
  kind: 'accurate' | 'underestimate' | 'overestimate' | 'zero-estimate' | 'zero-actual';
}
export const MAX_BYTES = 2 * 1024 * 1024;
const numericKeys = [
  'Startup Cost',
  'Total Cost',
  'Plan Rows',
  'Plan Width',
  'Actual Startup Time',
  'Actual Total Time',
  'Actual Rows',
  'Actual Loops',
  'Rows Removed by Filter',
  'Rows Removed by Join Filter',
  'Shared Hit Blocks',
  'Shared Read Blocks',
  'Temp Read Blocks',
  'Temp Written Blocks',
  'Sort Space Used',
  'Workers Planned',
  'Workers Launched',
];
function record(value: unknown): value is RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function numeric(
  raw: RawRecord,
  key: string,
  location: string,
  required = false,
): number | undefined {
  const value = raw[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`${location}: “${key}” must be a finite, non-negative number.`);
  return value;
}
function optionalString(raw: RawRecord, key: string): string | undefined {
  return typeof raw[key] === 'string' ? (raw[key] as string) : undefined;
}
export function parsePlan(input: string): ParsedPlan {
  if (!input.trim()) throw new Error('Paste a PostgreSQL EXPLAIN plan in JSON format to begin.');
  if (new TextEncoder().encode(input).length > MAX_BYTES)
    throw new Error('This plan exceeds the 2 MB limit. Export a smaller plan.');
  let json: unknown;
  try {
    json = JSON.parse(input);
  } catch {
    throw new Error(
      'Invalid JSON. Use EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), and copy just the JSON output.',
    );
  }
  if (Array.isArray(json)) {
    if (json.length !== 1)
      throw new Error(
        'Import exactly one statement at a time. The EXPLAIN array must contain one plan.',
      );
    json = json[0];
  }
  if (!record(json))
    throw new Error('Expected a PostgreSQL EXPLAIN object or a single-element array.');
  const document: RawRecord = 'Plan' in json ? json : { Plan: json };
  if (!record(document.Plan)) throw new Error('The “Plan” field must contain a plan node object.');
  const nodes: PlanNode[] = [];
  const walk = (raw: RawRecord, id: string, depth: number): PlanNode => {
    if (depth > 64 || nodes.length >= 1000)
      throw new Error('Plan is too complex. Maximum 1,000 nodes and 64 nesting levels.');
    if (typeof raw['Node Type'] !== 'string' || !raw['Node Type'].trim())
      throw new Error(`Node ${id}: missing a valid “Node Type”.`);
    for (const key of numericKeys) numeric(raw, key, `Node ${id}`);
    const estimatedRows = numeric(raw, 'Plan Rows', `Node ${id}`, true)!;
    const totalCost = numeric(raw, 'Total Cost', `Node ${id}`, true)!;
    const startupCost = numeric(raw, 'Startup Cost', `Node ${id}`, true)!;
    if (startupCost > totalCost)
      throw new Error(`Node ${id}: startup cost cannot exceed total cost.`);
    const actualRows = numeric(raw, 'Actual Rows', `Node ${id}`);
    const loops = numeric(raw, 'Actual Loops', `Node ${id}`);
    const actualTime = numeric(raw, 'Actual Total Time', `Node ${id}`);
    if (
      (actualRows !== undefined || loops !== undefined || actualTime !== undefined) &&
      (actualRows === undefined || loops === undefined)
    )
      throw new Error(
        `Node ${id}: actual measurements require both “Actual Rows” and “Actual Loops”.`,
      );
    if (loops !== undefined && !Number.isSafeInteger(loops))
      throw new Error(`Node ${id}: “Actual Loops” must be a safe integer.`);
    if (
      loops !== undefined &&
      ((actualTime !== undefined && !Number.isFinite(actualTime * loops)) ||
        (actualRows !== undefined && !Number.isFinite(actualRows * loops)))
    )
      throw new Error(`Node ${id}: cumulative measurements exceed the supported numeric range.`);
    if (raw.Plans !== undefined && !Array.isArray(raw.Plans))
      throw new Error(`Node ${id}: “Plans” must be an array of nodes.`);
    const node: PlanNode = {
      id,
      depth,
      type: raw['Node Type'],
      relation: optionalString(raw, 'Relation Name'),
      index: optionalString(raw, 'Index Name'),
      estimatedRows,
      startupCost,
      totalCost,
      actualRows,
      loops,
      actualTime,
      cumulativeTime:
        actualTime !== undefined && loops !== undefined ? actualTime * loops : undefined,
      totalRows: actualRows !== undefined && loops !== undefined ? actualRows * loops : undefined,
      raw,
      children: [],
    };
    nodes.push(node);
    node.children = ((raw.Plans as unknown[] | undefined) ?? []).map((child, i) => {
      if (!record(child)) throw new Error(`Node ${id}.${i + 1}: expected a plan node object.`);
      return walk(child, `${id}.${i + 1}`, depth + 1);
    });
    return node;
  };
  const root = walk(document.Plan, '1', 0);
  return {
    root,
    nodes,
    document,
    executionTime: numeric(document, 'Execution Time', 'Statement'),
    planningTime: numeric(document, 'Planning Time', 'Statement'),
    analyzed: root.actualRows !== undefined,
    parallel: nodes.some(
      (n) =>
        n.raw['Parallel Aware'] === true ||
        n.type === 'Gather' ||
        n.type === 'Gather Merge' ||
        Number(n.raw['Workers Launched'] ?? 0) > 0,
    ),
  };
}
export function estimateError(node: PlanNode): EstimateError | null {
  if (node.actualRows === undefined || node.loops === 0) return null;
  const estimated = node.estimatedRows,
    actual = node.actualRows;
  if (estimated === actual) return { factor: 1, kind: 'accurate' };
  if (estimated === 0) return { factor: null, kind: 'zero-estimate' };
  if (actual === 0) return { factor: null, kind: 'zero-actual' };
  return {
    factor: Math.max(actual / estimated, estimated / actual),
    kind: actual > estimated ? 'underestimate' : 'overestimate',
  };
}
export function analyzePlan(plan: ParsedPlan): Insight[] {
  const insights: Insight[] = [];
  for (const node of plan.nodes) {
    const error = estimateError(node);
    if (error && (error.factor === null || error.factor >= 10))
      insights.push({
        nodeId: node.id,
        kind: 'warning',
        title: 'Cardinality estimate differs',
        message:
          error.kind === 'zero-estimate'
            ? 'Planner expected zero rows, but this node returned rows. Check statistics and predicate selectivity.'
            : error.kind === 'zero-actual'
              ? `Planner expected ${formatNumber(node.estimatedRows)} rows per loop; actual output was zero. An early-stopping parent may also explain the difference.`
              : `Actual rows per loop were ${formatNumber(error.factor!)}× ${error.kind === 'underestimate' ? 'higher' : 'lower'} than estimated. Inspect statistics, correlation, and whether the node ran to completion.`,
      });
    const removed =
      typeof node.raw['Rows Removed by Filter'] === 'number'
        ? node.raw['Rows Removed by Filter']
        : 0;
    if (
      node.type.includes('Seq Scan') &&
      node.actualRows !== undefined &&
      node.loops !== 0 &&
      removed > 1000 &&
      removed / (removed + node.actualRows) > 0.9
    )
      insights.push({
        nodeId: node.id,
        kind: 'warning',
        title: 'Many rows discarded',
        message: `${formatNumber(removed * (node.loops ?? 1))} rows removed across loops. A selective predicate may benefit from an index; test it against the workload.`,
      });
    if (
      typeof node.raw['Sort Space Type'] === 'string' &&
      node.raw['Sort Space Type'].toLowerCase() === 'disk'
    )
      insights.push({
        nodeId: node.id,
        kind: 'warning',
        title: 'Sort spilled to disk',
        message:
          'This sort used disk space. Inspect input size, index ordering, and work_mem before changing memory settings.',
      });
    if (node.loops !== undefined && node.loops >= 100)
      insights.push({
        nodeId: node.id,
        kind: 'info',
        title: 'Repeated operation',
        message: `This node ran ${formatNumber(node.loops)} times. Actual time and rows in EXPLAIN are averages per loop; totals here multiply by loops.`,
      });
  }
  if (!plan.analyzed)
    insights.unshift({
      nodeId: plan.root.id,
      kind: 'info',
      title: 'Estimates only',
      message:
        'This plan has no actual row measurements. Run EXPLAIN ANALYZE to compare estimates with observed output.',
    });
  if (plan.parallel)
    insights.unshift({
      nodeId: plan.root.id,
      kind: 'info',
      title: 'Parallel execution',
      message:
        'Worker work overlaps. Node time × loops represents inclusive work, not wall-clock duration. Do not add node timings.',
    });
  return insights;
}
export interface Delta {
  before: number;
  after: number;
  change: number;
  percent: number | null;
}
export function delta(before: number | undefined, after: number | undefined): Delta | null {
  if (before === undefined || after === undefined) return null;
  return {
    before,
    after,
    change: after - before,
    percent: before === 0 ? null : ((after - before) / before) * 100,
  };
}
export function comparePlans(before: ParsedPlan, after: ParsedPlan) {
  return {
    execution: delta(before.executionTime, after.executionTime),
    cost: delta(before.root.totalCost, after.root.totalCost),
    nodes: delta(before.nodes.length, after.nodes.length),
    outputRows: delta(before.root.totalRows, after.root.totalRows),
  };
}
const formatters = new Map<number, Intl.NumberFormat>();
export function formatNumber(value: number, maximumFractionDigits = 2): string {
  let formatter = formatters.get(maximumFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits });
    formatters.set(maximumFractionDigits, formatter);
  }
  return formatter.format(value);
}
export function metric(value: number | undefined, suffix = ''): string {
  return value === undefined ? 'Not recorded' : `${formatNumber(value)}${suffix}`;
}
export function markdownReport(
  name: string,
  plan: ParsedPlan,
  source: string,
  compared?: { name: string; plan: ParsedPlan; source: string },
): string {
  const safe = (value: string) => value.replace(/[|\r\n]/g, ' ');
  const lines = [
    `# PlanScope report: ${safe(name)}`,
    '',
    `Source: ${source}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `- Execution time: ${metric(plan.executionTime, ' ms')}`,
    `- Planning time: ${metric(plan.planningTime, ' ms')}`,
    `- Root estimated cost: ${formatNumber(plan.root.totalCost)} planner units`,
    `- Plan nodes: ${plan.nodes.length}`,
    `- Parallel plan: ${plan.parallel ? 'yes' : 'no'}`,
    '',
    '## Operations',
    '',
    '| Node | Operation | Estimated rows/loop | Actual rows/loop | Loops | Inclusive work (ms) |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  ];
  for (const node of plan.nodes)
    lines.push(
      `| ${node.id} | ${safe(`${node.type} ${node.relation ?? ''}`)} | ${formatNumber(node.estimatedRows)} | ${metric(node.actualRows)} | ${metric(node.loops)} | ${metric(node.cumulativeTime)} |`,
    );
  lines.push('', '## Review signals', '');
  const insights = analyzePlan(plan);
  lines.push(
    ...(insights.length
      ? insights.map((i) => `- Node ${i.nodeId}: **${i.title}** — ${i.message}`)
      : ['No configured heuristics triggered. This does not establish that the query is optimal.']),
  );
  if (compared) {
    const comparison = comparePlans(plan, compared.plan);
    lines.push(
      '',
      `## Comparison against ${safe(compared.name)}`,
      '',
      `Comparison source: ${compared.source}`,
      '',
      `Execution delta: ${comparison.execution ? `${formatNumber(comparison.execution.change)} ms (${comparison.execution.percent === null ? 'no percentage from zero baseline' : `${formatNumber(comparison.execution.percent)}%`})` : 'unavailable'}`,
      `Root cost delta: ${comparison.cost ? formatNumber(comparison.cost.change) : 'unavailable'} planner units.`,
    );
  }
  lines.push(
    '',
    '## Interpretation limits',
    '',
    'Node timings and costs include descendant operations. Never sum them. Time × loops is inclusive work, not self time or a share of wall-clock time; parallel workers overlap. Rows × loops are approximate aggregate output because PostgreSQL rounds per-loop averages. Estimated versus actual rows compare per-loop values; early stopping (e.g. LIMIT) can affect this comparison. Buffer values are already accumulated, include descendants, and are not multiplied by loops. No query is executed by PlanScope. Heuristics suggest investigations, not guaranteed fixes. Compare repeated runs on equivalent data, configuration, and cache conditions.',
    '',
  );
  return lines.join('\n');
}
