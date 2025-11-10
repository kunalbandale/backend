import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { logger } from './utils/logger';
// @ts-ignore
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import sendRoutes from './routes/send';
import webhookRoutes from './routes/webhook';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: true, // Allow all origins
    credentials: true,
  })
);
app.use(morgan('dev'));

// Add request ID middleware
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || Math.random().toString(36).substr(2, 9);
  next();
});

// Add request logging middleware
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] as string;
  logger.info(`${req.method} ${req.path}`, {
    requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    url: req.url,
    method: req.method
  });
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/send', sendRoutes);
app.use('/webhook', webhookRoutes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

export default app;


