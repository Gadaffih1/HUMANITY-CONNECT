export type DumpColumn = { column_name: string; udt_name: string };

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function dumpDataSelect(tableName: string, columns: DumpColumn[]): string {
  const selected = columns.map((column) => {
    const name = quoteIdentifier(column.column_name);
    return column.udt_name === 'json' || column.udt_name === 'jsonb'
      ? `${name}::text AS ${name}`
      : name;
  });
  return `SELECT ${selected.join(', ')} FROM "public".${quoteIdentifier(tableName)}`;
}

export function sqlLiteral(value: unknown, udtName?: string): string {
  if (value === null || value === undefined) return 'NULL';

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

  // JSON columns are selected as text to preserve JSON scalars and distinguish JSON null from SQL NULL.
  if (udtName === 'json' || udtName === 'jsonb') {
    if (typeof value !== 'string') throw new Error(`Expected ${udtName} data as text`);
    return `${escapeStr(value)}::${udtName}`;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (Buffer.isBuffer(value)) return `E'\\\\x${value.toString('hex')}'::bytea`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `'{}'::text[]`;
    return `ARRAY[${value.map((v) => escapeStr(String(v))).join(', ')}]::text[]`;
  }
  if (typeof value === 'object') return `${escapeStr(JSON.stringify(value))}::jsonb`;
  return escapeStr(String(value));
}
