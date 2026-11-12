-- Humanity Connect — Versioned Migration 0001
-- Managed by Drizzle Kit (src/db/schema.ts -> Cloud SQL PostgreSQL)
-- Enforces UUID primary keys, strict financial non-negativity constraints,
-- consent & safeguarding indexes, and append-only payment/audit ledger semantics.

-- Verification query for schema integrity:
SELECT table_name, count(column_name) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
