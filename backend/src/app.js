import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import auditRoutes from './routes/audit.js';
import authRoutes from './routes/auth.js';
import registrationRoutes from './routes/registrations.js';
import userRoutes from './routes/users.js';
import workshopRoutes from './routes/workshops.js';

export function createApp({ logRequests = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '100kb' }));
  if (logRequests) app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/workshops', workshopRoutes);
  app.use('/api/registrations', registrationRoutes);
  app.use('/api/audit', auditRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
