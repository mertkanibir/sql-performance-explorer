import before from '../../demo/before.json';
import after from '../../demo/after.json';
import provenance from '../../demo/provenance.json';
export const baselineSample = JSON.stringify(before, null, 2);
export const optimizedSample = JSON.stringify(after, null, 2);
export const sampleProvenance = provenance;
function estimatesOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(estimatesOnly);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !key.startsWith('Actual ') &&
            !key.startsWith('Rows Removed') &&
            !key.includes('Blocks') &&
            ![
              'Execution Time',
              'Planning Time',
              'Planning',
              'Sort Method',
              'Sort Space Type',
              'Sort Space Used',
            ].includes(key),
        )
        .map(([key, val]) => [key, estimatesOnly(val)]),
    );
  return value;
}
export const estimatedSample = JSON.stringify(estimatesOnly(before), null, 2);
export const capturedSource =
  'Captured PostgreSQL 18.6 / PGlite 0.5.9 · 200,000 rows · single local run';
