import { config } from 'dotenv';

config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for ${name}: ${raw}`);
  }

  return parsed;
}

function optionalLowercaseList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: optionalNumber('PORT', 3000),
  APP_BASE_URL: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE ?? 'Europe/Bucharest',
  DISABLE_SCHEDULER: (process.env.DISABLE_SCHEDULER ?? 'false').toLowerCase() === 'true',

  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),

  COOKIE_SECRET: required('COOKIE_SECRET'),
  ADMIN_EMAILS: optionalLowercaseList('ADMIN_EMAILS'),
  ACCESS_COOKIE_NAME: 'confirmor_access_token',
  REFRESH_COOKIE_NAME: 'confirmor_refresh_token',

  SMS_PROVIDER: (process.env.SMS_PROVIDER ?? 'dummy').toLowerCase(),
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM_PHONE: process.env.TWILIO_FROM_PHONE,
  SMSO_API_KEY: process.env.SMSO_API_KEY,
  SMSO_SENDER: process.env.SMSO_SENDER,
  SMSO_BASE_URL: process.env.SMSO_BASE_URL ?? 'https://app.smso.ro/api/v1',
  CRON_SECRET: process.env.CRON_SECRET,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: optionalNumber('SMTP_PORT', 587),
  SMTP_SECURE: (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM ?? 'no-reply@confirmor.local',

  SEND_CONFIRMED_ACK: (process.env.SEND_CONFIRMED_ACK ?? 'false').toLowerCase() === 'true'
};

export const isProduction = env.NODE_ENV === 'production';
