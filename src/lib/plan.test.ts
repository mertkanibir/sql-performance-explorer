import { describe, expect, it } from 'vitest';
import {
  analyzePlan,
  comparePlans,
  delta,
  estimateError,
  markdownReport,
  MAX_BYTES,
  parsePlan,
} from './plan';
import { baselineSample, optimizedSample, estimatedSample } from '../data/samples';
const rawNode = (extra: Record<string, unknown> = {}) => ({
  'Node Type': 'Seq Scan',
  'Startup Cost': 0,
  'Total Cost': 10,
  'Plan Rows': 10,
  ...extra,
});
const input = (extra: Record<string, unknown> = {}) => JSON.stringify([{ Plan: rawNode(extra) }]);
describe('EXPLAIN parser', () => {
  it('parses captured PostgreSQL JSON, preserves fields and stable child IDs', () => {
    const plan = parsePlan(baselineSample);
    expect(plan.nodes).toHaveLength(3);
    expect(plan.root.type).toBe('Limit');
    expect(plan.nodes[2].id).toBe('1.1.1');
    expect(plan.executionTime).toBe(21.659);
    expect(plan.analyzed).toBe(true);
    expect(plan.nodes[2].raw['Rows Removed by Filter']).toBe(199980);
  });
  it('accepts wrapper object and bare plan node', () => {
    expect(parsePlan(JSON.stringify({ Plan: rawNode() })).root.type).toBe('Seq Scan');
    expect(parsePlan(JSON.stringify(rawNode())).nodes).toHaveLength(1);
  });
  it('distinguishes plain EXPLAIN from recorded measurements', () => {
    const plan = parsePlan(estimatedSample);
    expect(plan.analyzed).toBe(false);
    expect(plan.executionTime).toBeUndefined();
    expect(plan.root.actualRows).toBeUndefined();
    expect(analyzePlan(plan)[0].title).toBe('Estimates only');
  });
  it('supports ANALYZE TIMING OFF with actual rows but no node timings', () => {
    const plan = parsePlan(input({ 'Actual Rows': 3, 'Actual Loops': 2 }));
    expect(plan.analyzed).toBe(true);
    expect(plan.root.totalRows).toBe(6);
    expect(plan.root.cumulativeTime).toBeUndefined();
  });
  it('multiplies per-loop times and rows without inflating cardinality error', () => {
    const node = parsePlan(
      input({
        'Plan Rows': 10,
        'Actual Rows': 10,
        'Actual Loops': 1000,
        'Actual Total Time': 0.03,
      }),
    ).root;
    expect(node.totalRows).toBe(10000);
    expect(node.cumulativeTime).toBe(30);
    expect(estimateError(node)?.factor).toBe(1);
  });
  it('preserves zero loops as never executed', () => {
    const node = parsePlan(
      input({ 'Actual Rows': 0, 'Actual Loops': 0, 'Actual Total Time': 0 }),
    ).root;
    expect(node.cumulativeTime).toBe(0);
    expect(node.totalRows).toBe(0);
    expect(estimateError(node)).toBeNull();
  });
  it('does not multiply buffer counters by loops', () => {
    const node = parsePlan(
      input({ 'Actual Rows': 1, 'Actual Loops': 20, 'Shared Hit Blocks': 44 }),
    ).root;
    expect(node.raw['Shared Hit Blocks']).toBe(44);
  });
  it('detects parallel execution without pretending it is wall time', () => {
    const plan = parsePlan(
      input({
        'Node Type': 'Gather',
        'Actual Rows': 40,
        'Actual Loops': 1,
        'Actual Total Time': 12,
      }),
    );
    expect(plan.parallel).toBe(true);
    expect(analyzePlan(plan)[0].message).toContain('not wall-clock duration');
  });
  it.each(['', 'not JSON', '{}', '[]', '[{},{}]', 'null', '{"Plan":[]}'])(
    'rejects invalid structure: %s',
    (text) => expect(() => parsePlan(text)).toThrow(),
  );
  it.each([
    { 'Total Cost': -2 },
    { 'Plan Rows': '10' },
    { 'Node Type': '' },
    { Plans: {} },
    { Plans: [3] },
    { 'Actual Rows': 1 },
    { 'Actual Loops': 0.5, 'Actual Rows': 1 },
    { 'Startup Cost': 11 },
    { 'Actual Rows': 1e308, 'Actual Loops': 2 },
    { 'Actual Rows': 1, 'Actual Loops': 9007199254740992 },
  ])('rejects invalid node fields: %j', (extra) => expect(() => parsePlan(input(extra))).toThrow());
  it('enforces the input size limit', () =>
    expect(() => parsePlan(' '.repeat(MAX_BYTES + 1) + '{}')).toThrow('2 MB'));
  it('enforces depth and node limits', () => {
    let nested: Record<string, unknown> = rawNode();
    for (let i = 0; i < 66; i++) nested = rawNode({ Plans: [nested] });
    expect(() => parsePlan(JSON.stringify(nested))).toThrow('complex');
    expect(() =>
      parsePlan(input({ Plans: Array.from({ length: 1000 }, () => rawNode()) })),
    ).toThrow('complex');
  });
});
describe('cardinality diagnostics', () => {
  it('compares actual and estimated rows per loop in either direction', () => {
    expect(
      estimateError(parsePlan(input({ 'Actual Rows': 100, 'Actual Loops': 20 })).root),
    ).toEqual({ factor: 10, kind: 'underestimate' });
    expect(estimateError(parsePlan(input({ 'Actual Rows': 1, 'Actual Loops': 20 })).root)).toEqual({
      factor: 10,
      kind: 'overestimate',
    });
  });
  it('represents zero mismatches explicitly instead of emitting Infinity', () => {
    expect(
      estimateError(parsePlan(input({ 'Plan Rows': 0, 'Actual Rows': 3, 'Actual Loops': 1 })).root),
    ).toEqual({ factor: null, kind: 'zero-estimate' });
    expect(estimateError(parsePlan(input({ 'Actual Rows': 0, 'Actual Loops': 1 })).root)).toEqual({
      factor: null,
      kind: 'zero-actual',
    });
    expect(
      estimateError(parsePlan(input({ 'Plan Rows': 0, 'Actual Rows': 0, 'Actual Loops': 1 })).root),
    ).toEqual({ factor: 1, kind: 'accurate' });
  });
  it('detects selective sequential scans, disk spills, and repeated work', () => {
    const plan = parsePlan(
      input({
        'Actual Rows': 1,
        'Actual Loops': 200,
        'Rows Removed by Filter': 9999,
        'Sort Space Type': 'Disk',
      }),
    );
    expect(analyzePlan(plan).map((i) => i.title)).toEqual([
      'Cardinality estimate differs',
      'Many rows discarded',
      'Sort spilled to disk',
      'Repeated operation',
    ]);
  });
});
describe('comparisons and report', () => {
  it('uses statement execution times and root costs instead of summing nodes', () => {
    const result = comparePlans(parsePlan(baselineSample), parsePlan(optimizedSample));
    expect(result.execution?.before).toBe(21.659);
    expect(result.execution?.after).toBe(0.313);
    expect(result.execution?.percent).toBeCloseTo(-98.55487, 4);
    expect(result.cost?.after).toBe(64.48);
    expect(result.nodes?.change).toBe(1);
  });
  it('does not fabricate absent measurements or divide by zero', () => {
    expect(delta(undefined, 1)).toBeNull();
    expect(delta(0, 12)?.percent).toBeNull();
    expect(
      comparePlans(parsePlan(estimatedSample), parsePlan(baselineSample)).execution,
    ).toBeNull();
  });
  it('exports provenance, operation details, assumptions, and comparison', () => {
    const report = markdownReport('orders', parsePlan(baselineSample), 'Local PostgreSQL capture', {
      name: 'Indexed',
      plan: parsePlan(optimizedSample),
      source: 'Local capture',
    });
    expect(report).toContain('Local PostgreSQL capture');
    expect(report).toContain('Seq Scan planscope_orders');
    expect(report).toContain('Never sum them');
    expect(report).toContain('Comparison against Indexed');
    expect(report).toContain('-21.35 ms');
  });
});
