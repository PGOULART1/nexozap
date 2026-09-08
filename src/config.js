import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const srcDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(srcDirectory, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

function positiveInteger(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} deve ser um número inteiro positivo.`);
  }

  return value;
}

function booleanValue(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} deve ser true ou false.`);
}

function resolveFromProject(value) {
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

export const config = Object.freeze({
  appName: process.env.APP_NAME || 'NexoZap',
  sessionDirectory: resolveFromProject(process.env.SESSION_DIR || './data/session'),
  logLevel: process.env.LOG_LEVEL || 'info',
  logPretty: booleanValue('LOG_PRETTY', true),
  connectTimeoutMs: positiveInteger('CONNECT_TIMEOUT_MS', 120_000),
  reconnectInitialDelayMs: positiveInteger('RECONNECT_INITIAL_DELAY_MS', 2_000),
  reconnectMaxDelayMs: positiveInteger('RECONNECT_MAX_DELAY_MS', 30_000),
  maxFileSizeBytes: positiveInteger('MAX_FILE_SIZE_MB', 50) * 1024 * 1024,
});
