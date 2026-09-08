import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export function createApi({ client, token, groupId, logger, graphs }) {
  if (!token || token.length < 32) throw new Error('API_TOKEN deve ter pelo menos 32 caracteres.');
  if (!/^\d+(?:-\d+)?@g\.us$/.test(groupId || '')) throw new Error('Configure ALERT_GROUP_ID com o ID do grupo.');
  let busy = false;
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    const expected = Buffer.from(`Bearer ${token}`);
    const supplied = Buffer.from(req.headers.authorization || '');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return reply(401, { error: 'Não autorizado' });
    if (req.method === 'GET' && req.url === '/health') return reply(client.isConnected ? 200 : 503, { connected: client.isConnected });
    if (req.method !== 'POST' || req.url !== '/alerts') return reply(404, { error: 'Rota não encontrada' });
    if (!client.isConnected || busy) return reply(503, { error: 'Indisponível; tente novamente' });
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'Use application/json' });
    busy = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16_384) return reply(413, { error: 'Corpo muito grande' });
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      let data;
      try { data = JSON.parse(body); } catch { return reply(400, { error: 'JSON inválido' }); }
      if (!data || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 8000) return reply(400, { error: 'text deve conter entre 1 e 8000 caracteres' });
      const result = await client.sendText(groupId, data.text);
      let graphStatus = 'skipped';
      if (graphs && typeof data.itemId === 'string' && /^[1-9]\d{0,19}$/.test(data.itemId)) {
        try {
          const image = await graphs.getGraph(data.itemId);
          await client.sendImage(groupId, image, `Gráfico do item ${data.itemId} — última hora`);
          graphStatus = 'sent';
        } catch {
          graphStatus = 'failed';
          logger.warn('Texto enviado. Gráfico não enviado: confira configuração, permissões e conexão.');
        }
      }
      // Text already sent: graph failure must not trigger a duplicate text retry.
      reply(200, { messageId: result?.key?.id, graphStatus });
    } catch {
      logger.error('Falha no envio do alerta; confira a conexão WhatsApp.');
      reply(502, { error: 'Falha no envio; resultado pode ser incerto' });
    } finally { busy = false; }
  });
}
