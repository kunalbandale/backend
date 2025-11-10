import { connectToDatabase } from './config/db';
import { env } from './config/env';
import app from './app';
import { handleUnhandledRejection, handleUncaughtException } from './middleware/errorHandler';
import { logger } from './utils/logger';

async function start() {
  try {
    // Set up global error handlers
    handleUnhandledRejection();
    handleUncaughtException();

    logger.info('Starting server...');
    await connectToDatabase();
    logger.info('Connected to database');
    
    const server = app.listen(env.port, () => {
      logger.info(`Server running on http://localhost:${env.port}`);
      logger.info('Server is ready to accept requests');
    });
    
    // Add error handling for the server
    server.on('error', (error) => {
      logger.error('Server error occurred', error);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });
    
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err);
  process.exit(1);
});


