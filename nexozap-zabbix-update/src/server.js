import { WhatsAppClient } from './whatsapp-client.js';
import { createApi } from './http-api.js';
import { logger } from './logger.js';

const client = new WhatsAppClient();
let server;
try {
  server = createApi({ client, logger, token: process.env.API_TOKEN, groupId: process.env.ALERT_GROUP_ID });
  const port = Number(process.env.API_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT inválida');
  await client.start();
  server.on('error', (error) => {
    logger.error({ err: error }, 'Falha na API');
    client.stop();
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => logger.info({ port }, 'API NexoZap disponível em localhost'));
  const stop = () => { server.close(); server.closeAllConnections(); client.stop(); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
} catch (error) {
  logger.error({ err: error }, 'Não foi possível iniciar a API');
  client.stop();
  process.exitCode = 1;
}
