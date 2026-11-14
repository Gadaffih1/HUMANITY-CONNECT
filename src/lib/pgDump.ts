import { pool } from '../db/index.ts';

function sqlLiteral(value: unknown, udtName?: string): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (Buffer.isBuffer(value)) return `E'\\\\x${value.toString('hex')}'::bytea`;

  const escapeStr = (s: string) => {
    if (/[\n\r\t\\]/.test(s)) {
      const escaped = s
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "''")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `E'${escaped}'`;
    }
    return `'${s.replace(/'/g, "''")}'`;
  };

  if (Array.isArray(value)) {
    if (value.length === 0) return `'{}'::text[]`;
    return `ARRAY[${value.map((v) => escapeStr(String(v))).join(', ')}]::text[]`;
  }

  if (typeof value === 'object' || udtName === 'jsonb' || udtName === 'json') {
    const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
    return `${escapeStr(jsonStr)}::jsonb`;
  }

  return escapeStr(String(value));
}

export async function generatePostgresLogicalDumpSql(): Promise<{
  sql: string;
  tableCount: number;
  totalRows: number;
}> {
  const tablesRes = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const allTables = tablesRes.rows.map((r) => r.table_name);

  const fkRes = await pool.query<{ child_table: string; parent_table: string }>(`
    SELECT
      cl.relname AS child_table,
      ref.relname AS parent_table
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_class ref ON ref.oid = c.confrelid
    WHERE n.nspname = 'public' AND c.contype = 'f';
  `);

  const parentsMap = new Map<string, Set<string>>();
  for (const t of allTables) parentsMap.set(t, new Set());
  for (const fk of fkRes.rows) {
    if (fk.child_table !== fk.parent_table) {
      parentsMap.get(fk.child_table)?.add(fk.parent_table);
    }
  }

  const orderedTables: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (t: string) => {
    if (visited.has(t) || visiting.has(t)) return;
    visiting.add(t);
    for (const p of parentsMap.get(t) || []) {
      visit(p);
    }
    visiting.delete(t);
    visited.add(t);
    orderedTables.push(t);
  };
  for (const t of allTables) visit(t);

  const lines: string[] = [
    '-- HUMANITY CONNECT — PostgreSQL Logical Dump',
    `-- Exported At: ${new Date().toISOString()}`,
    '-- Target: PostgreSQL 15+ (restore: psql -d humanity_connect -f humanity-connect-postgres-dump.sql)',
    '',
    'BEGIN;',
    'SET statement_timeout = 0;',
    "SET client_encoding = 'UTF8';",
    'SET standard_conforming_strings = on;',
    'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
    '',
  ];

  const fkStatements: string[] = [];
  const tableColumnsMap = new Map<string, Array<{ column_name: string; udt_name: string }>>();

  for (const tableName of orderedTables) {
    const colsRes = await pool.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `,
      [tableName]
    );

    tableColumnsMap.set(
      tableName,
      colsRes.rows.map((c) => ({ column_name: c.column_name, udt_name: c.udt_name }))
    );

    const consRes = await pool.query<{
      conname: string;
      contype: string;
      condef: string;
    }>(
      `
      SELECT c.conname, c.contype, pg_get_constraintdef(c.oid, true) AS condef
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = 'public'
        AND cl.relname = $1
        AND c.contype IN ('p', 'u', 'f', 'c')
      ORDER BY c.contype, c.conname;
    `,
      [tableName]
    );

    const colDefs = colsRes.rows.map((c) => {
      let pgType = c.data_type;
      if (c.data_type === 'ARRAY') {
        pgType = `${c.udt_name.replace(/^_/, '')}[]`;
      } else if (c.data_type === 'timestamp with time zone') {
        pgType = 'timestamptz';
      }
      const parts = [`  "${c.column_name}" ${pgType}`];
      if (c.column_default) parts.push(`DEFAULT ${c.column_default}`);
      if (c.is_nullable === 'NO') parts.push('NOT NULL');
      return parts.join(' ');
    });

    const inlineCons: string[] = [];
    for (const con of consRes.rows) {
      if (con.contype === 'f') {
        fkStatements.push(
          `ALTER TABLE "public"."${tableName}" DROP CONSTRAINT IF EXISTS "${con.conname}";\nALTER TABLE "public"."${tableName}" ADD CONSTRAINT "${con.conname}" ${con.condef};`
        );
      } else {
        inlineCons.push(`  CONSTRAINT "${con.conname}" ${con.condef}`);
      }
    }

    lines.push(`-- Table: public.${tableName}`);
    lines.push(`CREATE TABLE IF NOT EXISTS "public"."${tableName}" (`);
    lines.push([...colDefs, ...inlineCons].join(',\n'));
    lines.push(');');
    lines.push('');

    const idxRes = await pool.query<{ indexname: string; indexdef: string }>(
      `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
        AND indexname NOT IN (
          SELECT c.conname FROM pg_constraint c
          JOIN pg_class cl ON cl.oid = c.conrelid
          WHERE cl.relname = $1
        )
      ORDER BY indexname;
    `,
      [tableName]
    );

    for (const idx of idxRes.rows) {
      lines.push(
        idx.indexdef
          .replace(/^CREATE UNIQUE INDEX /i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
          .replace(/^CREATE INDEX /i, 'CREATE INDEX IF NOT EXISTS ') + ';'
      );
    }
    if (idxRes.rows.length > 0) lines.push('');
  }

  if (fkStatements.length > 0) {
    lines.push('-- Foreign Key Constraints');
    lines.push(...fkStatements);
    lines.push('');
  }

  let totalRows = 0;
  lines.push('-- Table Data');
  for (const tableName of orderedTables) {
    const cols = tableColumnsMap.get(tableName) || [];
    if (cols.length === 0) continue;
    const dataRes = await pool.query(`SELECT * FROM "public"."${tableName}"`);
    totalRows += dataRes.rows.length;
    lines.push(`-- Data for ${tableName} (${dataRes.rows.length} rows)`);
    const colNamesSql = cols.map((c) => `"${c.column_name}"`).join(', ');
    for (const row of dataRes.rows) {
      const valsSql = cols
        .map((c) => sqlLiteral(row[c.column_name], c.udt_name))
        .join(', ');
      lines.push(
        `INSERT INTO "public"."${tableName}" (${colNamesSql}) VALUES (${valsSql}) ON CONFLICT DO NOTHING;`
      );
    }
    lines.push('');
  }

  lines.push('COMMIT;');

  return {
    sql: lines.join('\n'),
    tableCount: orderedTables.length,
    totalRows,
  };
}
