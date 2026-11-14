import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { checkDatabaseHealth } from './src/db/index.ts';
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

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  // Required behind Cloud Run / reverse proxy / custom domain TLS termination for secure cookies & client IP
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', async (_req, res) => {
    const dbStatus = await checkDatabaseHealth();
    if (!dbStatus.connected) {
      return res.status(503).json({
        ok: false,
        service: 'humanity-connect',
        database: dbStatus,
      });
    }
    lastDbHealthyAt = Date.now();
    res.json({
      ok: true,
      service: 'humanity-connect',
      database: dbStatus,
    });
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

  app.use('/src/assets/images', express.static(path.resolve(process.cwd(), 'src/assets/images')));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Humanity Connect server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
