import pino from 'pino';
import { config } from './config.js';

const transport = config.logPretty
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export const logger = pino(
  {
    name: config.appName,
    level: config.logLevel,
  },
  transport ? pino.transport(transport) : undefined,
);
