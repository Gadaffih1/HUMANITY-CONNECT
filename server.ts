import 'dotenv/config';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { checkDatabaseHealth, isTransientDbError } from './src/db/index.ts';
import { ensureReferenceDataSeeded } from './src/db/seed.ts';
import { authRouter } from './src/routes/auth.routes.ts';
import { publicRouter } from './src/routes/public.routes.ts';
import { beneficiaryRouter } from './src/routes/beneficiary.routes.ts';
import { supporterRouter } from './src/routes/supporter.routes.ts';
import { adminRouter } from './src/routes/admin.routes.ts';
import { aiRouter } from './src/routes/ai.routes.ts';
import { corporateRouter } from './src/routes/corporate.routes.ts';
import { paymentsRouter } from './src/routes/payments.routes.ts';
import { operationsRouter } from './src/routes/operations.routes.ts';
import { communicationsRouter } from './src/routes/communications.routes.ts';
import { matchingRouter } from './src/routes/matching.routes.ts';
import { staffRouter } from './src/routes/staff.routes.ts';

let lastDbHealthyAt = 0;
const DB_HEALTH_CACHE_MS = 15000;

let processGuardsRegistered = false;
function registerProcessSafetyGuards() {
  if (processGuardsRegistered) return;
  processGuardsRegistered = true;

  process.on('unhandledRejection', (reason) => {
    const errObj = reason as { code?: string; message?: string } | undefined;
    console.error('Unhandled Promise Rejection captured (process kept alive):', {
      code: errObj?.code,
      message: errObj?.message || String(reason),
    });
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception captured:', {
      name: err.name,
      message: err.message,
    });
  });
}

function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    'https://humanityconnect.co.ke',
    'https://www.humanityconnect.co.ke',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
  ]);
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && !appUrl.startsWith('MY_')) {
    try {
      origins.add(new URL(appUrl).origin);
    } catch {
      // Ignore malformed APP_URL placeholder
    }
  }
  const extra = process.env.ALLOWED_ORIGINS?.split(',') || [];
  for (const item of extra) {
    const trimmed = item.trim();
    if (trimmed) {
      try {
        origins.add(new URL(trimmed).origin);
      } catch {
        // Ignore malformed entry
      }
    }
  }
  return origins;
}

async function startServer() {
  registerProcessSafetyGuards();

  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const allowedOrigins = buildAllowedOrigins();

  // Required behind TalkSasa Cloud / Cloud Run / Nginx reverse proxy for secure cookies & client IP
  app.set('trust proxy', 1);

  // Explicit CORS policy for production custom domain & local development
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Active-Role, X-Requested-With'
      );
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      const dbStatus = await checkDatabaseHealth();
      if (!dbStatus.connected) {
        return res.status(503).json({
          ok: false,
          service: 'humanity-connect',
          database: dbStatus,
        });
      }
      lastDbHealthyAt = Date.now();
      return res.json({
        ok: true,
        service: 'humanity-connect',
        database: dbStatus,
      });
    } catch {
      return res.status(503).json({
        ok: false,
        service: 'humanity-connect',
        database: { connected: false, errorCode: 'HEALTH_CHECK_FAILED' },
      });
    }
  });

  // Restrict browser-side HTTP disk/memory caching across all browsers so data & settings
  // are strictly read from and saved to PostgreSQL.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Vary', 'Authorization, Cookie, Origin');
    next();
  });

  // Verify DB connectivity with cold-start retries, then ensure reference data is seeded without
  // blocking authentication routes on non-fatal secondary seed errors.
  app.use('/api', async (req, res, next) => {
    try {
      if (Date.now() - lastDbHealthyAt > DB_HEALTH_CACHE_MS) {
        const health = await checkDatabaseHealth();
        if (!health.connected) {
          console.error('Database connectivity check failed:', health.errorCode, 'path:', req.path);
          return res.status(503).json({
            error: `Database service temporarily unavailable (${health.errorCode || 'DB_UNREACHABLE'}). Please retry shortly.`,
          });
        }
        lastDbHealthyAt = Date.now();
      }
      await ensureReferenceDataSeeded().catch((seedErr) => {
        console.warn('Reference data seeding warning (non-blocking):', seedErr);
      });
      next();
    } catch (err) {
      lastDbHealthyAt = 0;
      console.error('Database initialization error:', err);
      res.status(503).json({
        error: 'Database service temporarily unavailable. Please retry shortly.',
      });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/beneficiary', beneficiaryRouter);
  app.use('/api/supporter', supporterRouter);
  app.use('/api/corporate', corporateRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/operations', operationsRouter);
  app.use('/api/communications', communicationsRouter);
  app.use('/api/matching', matchingRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/ai', aiRouter);

  // Explicit 404 JSON for unknown /api/* paths so SPA fallback never returns HTML to API callers
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use('/src/assets/images', express.static(path.resolve(process.cwd(), 'src/assets/images')));

  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const forceStatic =
    process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true';

  let viteMounted = false;
  if (!forceStatic) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      viteMounted = true;
    } catch (viteErr) {
      console.warn(
        'Vite dev middleware not available; falling back to static dist/ bundle:',
        viteErr instanceof Error ? viteErr.message : String(viteErr)
      );
    }
  }

  if (!viteMounted) {
    if (fs.existsSync(distIndex)) {
      app.use(express.static(distDir));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        res.sendFile(distIndex);
      });
    } else {
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        res.status(503).send('Application bundle is not built yet. Run npm run build and restart.');
      });
    }
  }

  // Global Express Error Middleware — prevents uncaught route/middleware errors from dropping sockets (502)
  // and ensures sensitive DB/secret details are never leaked to clients.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const errObj =
      err && typeof err === 'object'
        ? (err as {
            status?: number;
            type?: string;
            code?: string;
            message?: string;
            cause?: { code?: string; message?: string };
          })
        : {};
    const pgCode = errObj.code || errObj.cause?.code;
    console.error('Unhandled Express route error:', {
      method: req.method,
      path: req.path,
      code: pgCode,
      message: errObj.message || String(err),
    });

    if (res.headersSent) {
      return;
    }

    if (errObj.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'Invalid JSON request payload.' });
    }
    if (isTransientDbError(err) || pgCode === '57P03' || pgCode === '53300') {
      return res.status(503).json({
        error: 'Service temporarily unavailable due to database load. Please try again shortly.',
      });
    }
    const status = typeof errObj.status === 'number' && errObj.status >= 400 && errObj.status < 600
      ? errObj.status
      : 500;
    return res.status(status).json({
      error: status >= 500 ? 'Internal server error. Please try again later.' : errObj.message || 'Request failed.',
    });
  });

  const httpServer = app.listen(port, '0.0.0.0', () => {
    console.log(`Humanity Connect server listening on http://0.0.0.0:${port}`);
  });

  // Prevent 502 Bad Gateway behind Nginx / TalkSasa reverse proxy caused by Node's 5s default keepAliveTimeout
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
  httpServer.requestTimeout = 30000;
}

startServer();
