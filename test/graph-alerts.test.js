import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/http-api.js';

for (const scenario of ['success', 'download-failure', 'send-failure', 'no-item', 'disabled']) {
  test(`alerta com gráfico: ${scenario}`, async () => {
    const calls = [];
    const client = { isConnected: true,
      async sendText(jid, text) { calls.push(['text', jid, text]); return { key: { id: 'text-id' } }; },
      async sendImage(jid, image, caption) {
        calls.push(['image', jid, image, caption]);
        if (scenario === 'send-failure') throw new Error('media failed');
        return { key: { id: 'image-id' } };
      },
    };
    const graphs = scenario === 'disabled' ? undefined : { async getGraph(id) {
      calls.push(['graph', id]);
      if (scenario === 'download-failure') throw new Error('login failed');
      return Buffer.from('image');
    } };
    const token = 'a'.repeat(32);
    const server = createApi({ client, graphs, token, groupId: '123@g.us', logger: { warn() {}, error() {} } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/alerts`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Alerta', itemId: scenario === 'no-item' ? '{ITEM.ID1}' : '12345' }) });
      assert.equal(response.status, scenario === 'send-failure' ? 502 : 200);
      const result = await response.json();
      const sends = calls.filter(x => x[0] === 'text' || x[0] === 'image');
      assert.equal(sends.length, 1, 'Exatamente uma tentativa de envio por requisição');
      if (scenario === 'success' || scenario === 'send-failure') {
        assert.deepEqual(sends[0], ['image', '123@g.us', Buffer.from('image'), 'Alerta']);
        assert.equal(calls.filter(x => x[0] === 'text').length, 0);
        if (scenario === 'success') {
          assert.equal(result.messageId, 'image-id');
          assert.equal(result.graphStatus, 'sent');
        } else assert.ok(result.error);
      } else {
        assert.deepEqual(sends[0], ['text', '123@g.us', 'Alerta']);
        assert.equal(result.messageId, 'text-id');
        assert.equal(result.graphStatus, scenario === 'download-failure' ? 'failed' : 'skipped');
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });
}
