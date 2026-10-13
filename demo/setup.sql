-- Deterministic sample dataset; works in PostgreSQL and PGlite.
CREATE TABLE planscope_orders (
  id bigint PRIMARY KEY,
  customer_id integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  total numeric(12,2) NOT NULL
);
INSERT INTO planscope_orders
SELECT g, (g * 7919) % 10000,
       CASE WHEN g % 5 = 0 THEN 'pending' ELSE 'paid' END,
       TIMESTAMPTZ '2025-01-01 00:00:00+00' + g * INTERVAL '1 minute',
       ((g % 10000) + 100)::numeric / 100
FROM generate_series(1, 200000) AS g;
ANALYZE planscope_orders;
SET max_parallel_workers_per_gather = 0;

-- Capture baseline plan:
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, total, created_at
FROM planscope_orders
WHERE customer_id = 4242 AND status = 'paid'
ORDER BY created_at DESC
LIMIT 20;

CREATE INDEX planscope_orders_lookup ON planscope_orders (customer_id, status, created_at DESC);

-- Capture indexed plan:
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, total, created_at
FROM planscope_orders
WHERE customer_id = 4242 AND status = 'paid'
ORDER BY created_at DESC
LIMIT 20;
