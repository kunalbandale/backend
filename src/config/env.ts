import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  mongoUri: requireEnv('MONGODB_URI', 'mongodb://localhost:27017/etapalwala'),
  jwtSecret: requireEnv('JWT_SECRET', 'dev_secret_change_me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  corsOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:4000,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  wa: {
    baseUrl: process.env.WA_BASE_URL ?? 'https://graph.facebook.com/',//https://graph.facebook.com/v22.0/784316361437456/messages
    version: process.env.WA_API_VERSION ?? 'v22.0',
    accessToken: requireEnv('WA_ACCESS_TOKEN', 'replace'),
    phoneNumberId: requireEnv('WA_PHONE_NUMBER_ID', 'replace'),
  },
};



