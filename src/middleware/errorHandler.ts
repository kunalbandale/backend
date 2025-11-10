import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MongoError } from 'mongodb';
import mongoose from 'mongoose';

// Custom error classes
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public status: string;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public errors: any;

  constructor(message: string, errors: any) {
    super(message, 400);
    this.errors = errors;
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 500);
  }
}

export class WhatsAppAPIError extends AppError {
  public originalError: any;

  constructor(message: string, originalError?: any) {
    super(message, 502);
    this.originalError = originalError;
  }
}

// Error handling middleware
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = { ...err } as any;
  error.message = err.message;

  // Log error for debugging
  console.error('🚨 Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid ID format';
    error = new AppError(message, 400);
  }

  // Mongoose duplicate key
  if ((err as MongoError).code === 11000) {
    const field = Object.keys((err as any).keyValue)[0];
    const message = `${field} already exists`;
    error = new AppError(message, 409);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values((err as any).errors).map((val: any) => val.message);
    const message = `Validation Error: ${errors.join(', ')}`;
    error = new ValidationError(message, errors);
  }

  // Zod validation error
  if (err instanceof ZodError) {
    const errors = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
    const message = 'Validation failed';
    error = new ValidationError(message, errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new AppError(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new AppError(message, 401);
  }

  // File upload errors
  if (err.name === 'MulterError') {
    let message = 'File upload error';
    if ((err as any).code === 'LIMIT_FILE_SIZE') {
      message = 'File too large';
    } else if ((err as any).code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    } else if ((err as any).code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }
    error = new AppError(message, 400);
  }

  // WhatsApp API errors
  if (err.message.includes('WhatsApp') || err.message.includes('WA_')) {
    error = new WhatsAppAPIError(err.message, err);
  }

  // Database connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    error = new DatabaseError('Database connection failed');
  }

  // Default to 500 server error
  if (!error.statusCode) {
    error = new AppError('Internal Server Error', 500);
  }

  // Send error response
  const statusCode = error.statusCode || 500;
  const status = error.status || 'error';

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const errorResponse: any = {
    status,
    message: error.message,
    ...(isDevelopment && { stack: error.stack })
  };

  // Add validation errors if present
  if (error.errors) {
    errorResponse.errors = error.errors;
  }

  // Add request ID for tracking
  errorResponse.requestId = req.headers['x-request-id'] || 'unknown';

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
export const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new AppError(`Not found - ${req.originalUrl}`, 404);
  next(error);
};

// Global unhandled promise rejection handler
export const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (err: Error) => {
    console.error('🚨 Unhandled Promise Rejection:', err);
    process.exit(1);
  });
};

// Global uncaught exception handler
export const handleUncaughtException = () => {
  process.on('uncaughtException', (err: Error) => {
    console.error('🚨 Uncaught Exception:', err);
    process.exit(1);
  });
};

