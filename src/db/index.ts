import fs from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

function resolveUnixSocketHost(rawHost?: string): string | undefined {
  const candidates: string[] = [];
  if (rawHost) candidates.push(rawHost.trim());

  if (rawHost?.startsWith('/app/cloudsql/')) {
    candidates.push(`/cloudsql/${rawHost.slice('/app/cloudsql/'.length)}`);
  } else if (rawHost?.startsWith('/cloudsql/')) {
    candidates.push(`/app/cloudsql/${rawHost.slice('/cloudsql/'.length)}`);
  }

  if (process.env.INSTANCE_UNIX_SOCKET) {
    candidates.push(process.env.INSTANCE_UNIX_SOCKET.trim());
  }
  if (process.env.CLOUD_SQL_CONNECTION_NAME) {
    const conn = process.env.CLOUD_SQL_CONNECTION_NAME.trim();
    candidates.push(`/cloudsql/${conn}`, `/app/cloudsql/${conn}`);
  }

  for (const candidate of candidates) {
    if (candidate.startsWith('/') && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return rawHost?.trim() || undefined;
}

function buildPoolConfig(): PoolConfig {
  const connectionString =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim();

  const rawHost =
    process.env.SQL_HOST ||
    process.env.PGHOST ||
    process.env.INSTANCE_UNIX_SOCKET ||
    (process.env.CLOUD_SQL_CONNECTION_NAME
      ? `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME.trim()}`
      : undefined);

  const resolvedHost = resolveUnixSocketHost(rawHost);
  const user =
    process.env.SQL_USER || process.env.SQL_ADMIN_USER || process.env.PGUSER || undefined;
  const password =
    process.env.SQL_PASSWORD ||
    process.env.SQL_ADMIN_PASSWORD ||
    process.env.PGPASSWORD ||
    undefined;
  const database = process.env.SQL_DB_NAME || process.env.PGDATABASE || undefined;
  const port = process.env.SQL_PORT
    ? Number(process.env.SQL_PORT)
    : process.env.PGPORT
      ? Number(process.env.PGPORT)
      : undefined;

  if (connectionString && !resolvedHost) {
    const requiresSsl =
      connectionString.includes('sslmode=require') ||
      connectionString.includes('sslmode=verify-full') ||
      process.env.SQL_SSL === 'true' ||
      process.env.PGSSLMODE === 'require';
    return {
      connectionString,
      ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000,
    };
  }

  const isUnixSocket = Boolean(resolvedHost && resolvedHost.startsWith('/'));
  const useSsl =
    !isUnixSocket &&
    (process.env.SQL_SSL === 'true' || process.env.PGSSLMODE === 'require');

  return {
    host: resolvedHost,
    ...(port && !isUnixSocket ? { port } : {}),
    user,
    password,
    database,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
  };
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool(buildPoolConfig());

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export { pool };

const TRANSIENT_DB_CODES = new Set([
  'ENOENT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  '57P03', // cannot_connect_now (PostgreSQL starting up)
  '53300', // too_many_connections
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
]);

export function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string; cause?: { code?: string } };
  const code = e.code || e.cause?.code || '';
  if (TRANSIENT_DB_CODES.has(code)) return true;
  const msg = (e.message || '').toLowerCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('database system is starting up')
  );
}

export async function withDbRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isTransientDbError(err)) {
        await new Promise((r) => setTimeout(r, attempt * 350));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  errorCode?: string;
}> {
  const started = Date.now();
  try {
    await withDbRetry(() => pool.query('SELECT 1'), 3);
    return { connected: true, latencyMs: Date.now() - started };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; cause?: { code?: string } };
    return {
      connected: false,
      latencyMs: Date.now() - started,
      errorCode: e?.code || e?.cause?.code || 'DB_UNREACHABLE',
    };
  }
}
