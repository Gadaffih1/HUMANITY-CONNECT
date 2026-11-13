import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
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

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'humanity-connect' });
  });

  // Lazy reference data seeding on first API traffic (never an eager startup probe)
  app.use('/api', async (_req, res, next) => {
    try {
      await ensureReferenceDataSeeded();
      next();
    } catch (err) {
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
  app.use('/api/admin', adminRouter);
  app.use('/api/ai', aiRouter);

  app.use('/src/assets/images', express.static(path.resolve(process.cwd(), 'src/assets/images')));

  if (process.env.NODE_ENV !== 'production') {
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
