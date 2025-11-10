import fs from 'fs';
import path from 'path';

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG'
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  url?: string;
  method?: string;
}

class Logger {
  private logDir: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const logLine = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    return JSON.stringify(logLine) + '\n';
  }

  private writeToFile(filename: string, logEntry: string) {
    const filePath = path.join(this.logDir, filename);
    fs.appendFileSync(filePath, logEntry);
  }

  private log(level: LogLevel, message: string, data?: any, requestId?: string, userId?: string, ip?: string, userAgent?: string, url?: string, method?: string) {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      requestId,
      userId,
      ip,
      userAgent,
      url,
      method
    };

    const formattedLog = this.formatLogEntry(logEntry);

    // Console output
    const consoleMessage = `[${level}] ${message}`;
    switch (level) {
      case LogLevel.ERROR:
        console.error(consoleMessage, data || '');
        break;
      case LogLevel.WARN:
        console.warn(consoleMessage, data || '');
        break;
      case LogLevel.INFO:
        console.info(consoleMessage, data || '');
        break;
      case LogLevel.DEBUG:
        console.debug(consoleMessage, data || '');
        break;
    }

    // File output
    const today = new Date().toISOString().split('T')[0];
    const filename = `${today}.log`;
    this.writeToFile(filename, formattedLog);

    // Error-specific file
    if (level === LogLevel.ERROR) {
      this.writeToFile('errors.log', formattedLog);
    }
  }

  error(message: string, data?: any, requestId?: string, userId?: string, ip?: string, userAgent?: string, url?: string, method?: string) {
    this.log(LogLevel.ERROR, message, data, requestId, userId, ip, userAgent, url, method);
  }

  warn(message: string, data?: any, requestId?: string, userId?: string, ip?: string, userAgent?: string, url?: string, method?: string) {
    this.log(LogLevel.WARN, message, data, requestId, userId, ip, userAgent, url, method);
  }

  info(message: string, data?: any, requestId?: string, userId?: string, ip?: string, userAgent?: string, url?: string, method?: string) {
    this.log(LogLevel.INFO, message, data, requestId, userId, ip, userAgent, url, method);
  }

  debug(message: string, data?: any, requestId?: string, userId?: string, ip?: string, userAgent?: string, url?: string, method?: string) {
    this.log(LogLevel.DEBUG, message, data, requestId, userId, ip, userAgent, url, method);
  }

  // WhatsApp specific logging
  whatsappError(message: string, data?: any, requestId?: string) {
    this.error(`WhatsApp API Error: ${message}`, data, requestId);
  }

  whatsappInfo(message: string, data?: any, requestId?: string) {
    this.info(`WhatsApp API: ${message}`, data, requestId);
  }

  // Database specific logging
  dbError(message: string, data?: any, requestId?: string) {
    this.error(`Database Error: ${message}`, data, requestId);
  }

  dbInfo(message: string, data?: any, requestId?: string) {
    this.info(`Database: ${message}`, data, requestId);
  }

  // Authentication specific logging
  authError(message: string, data?: any, requestId?: string, ip?: string) {
    this.error(`Authentication Error: ${message}`, data, requestId, undefined, ip);
  }

  authInfo(message: string, data?: any, requestId?: string, userId?: string, ip?: string) {
    this.info(`Authentication: ${message}`, data, requestId, userId, ip);
  }

  // File upload specific logging
  fileError(message: string, data?: any, requestId?: string) {
    this.error(`File Upload Error: ${message}`, data, requestId);
  }

  fileInfo(message: string, data?: any, requestId?: string) {
    this.info(`File Upload: ${message}`, data, requestId);
  }
}

export const logger = new Logger();

