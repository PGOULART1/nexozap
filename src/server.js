import { WhatsAppClient } from './whatsapp-client.js';
import { createApi } from './http-api.js';
import { logger } from './logger.js';
import { ZabbixGraphs } from './zabbix-graphs.js';

const client = new WhatsAppClient();
let server;
try {
  let graphs;
  if (process.env.ZABBIX_GRAPHS_ENABLED === 'true') {
    try {
      graphs = new ZabbixGraphs({ url: process.env.ZABBIX_URL, username: process.env.ZABBIX_USERNAME, password: process.env.ZABBIX_PASSWORD });
    } catch {
      logger.warn('Gráficos desativados: confira ZABBIX_URL, ZABBIX_USERNAME e ZABBIX_PASSWORD. Texto continua ativo.');
    }
  }
  server = createApi({ client, logger, graphs, token: process.env.API_TOKEN, groupId: process.env.ALERT_GROUP_ID });
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
