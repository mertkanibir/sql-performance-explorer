import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const setup = await readFile(new URL('./setup.sql', import.meta.url), 'utf8');
const source = JSON.parse(await readFile(new URL('./provenance.json', import.meta.url), 'utf8'));
const db = new PGlite();
try {
  await db.exec(setup.split('-- Capture baseline plan:')[0]);
  const query = source.query;
  const before = (await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`)).rows[0][
    'QUERY PLAN'
  ];
  const baselineRows = (await db.query(query)).rows;
  await db.exec(source.index);
  const after = (await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`)).rows[0][
    'QUERY PLAN'
  ];
  const indexedRows = (await db.query(query)).rows;
  assert.deepEqual(indexedRows, baselineRows, 'Index experiment must preserve results');
  assert.equal(indexedRows.length, 20);
  const postgresVersion = (await db.query('SELECT version() AS version')).rows[0].version;
  const provenance = {
    capturedAt: new Date().toISOString(),
    engine: '@electric-sql/pglite 0.5.9 (real PostgreSQL compiled to WebAssembly)',
    postgresVersion,
    datasetRows: 200000,
    query,
    index: source.index,
    baselineExecutionMs: before[0]['Execution Time'],
    indexedExecutionMs: after[0]['Execution Time'],
    identicalResultRows: indexedRows.length,
    caveat:
      'Single captures in local PGlite; timings depend on engine, host, and cache state and are not production benchmarks.',
  };
  const output = new URL('./generated/', import.meta.url);
  await mkdir(output, { recursive: true });
  for (const [name, data] of Object.entries({ before, after, provenance }))
    await writeFile(new URL(`${name}.json`, output), JSON.stringify(data, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        output: fileURLToPath(output),
        baselineMs: provenance.baselineExecutionMs,
        indexedMs: provenance.indexedExecutionMs,
        identicalResultRows: indexedRows.length,
      },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
