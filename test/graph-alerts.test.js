import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/http-api.js';

for (const scenario of ['success', 'download-failure', 'send-failure', 'no-item', 'disabled']) {
  test(`alerta com gráfico: ${scenario}`, async () => {
    const calls = [];
    const client = { isConnected: true,
      async sendText(jid, text) { calls.push(['text', jid, text]); return { key: { id: 'text-id' } }; },
      async sendImage(jid) { calls.push(['image', jid]); if (scenario === 'send-failure') throw new Error('media failed'); },
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
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.messageId, 'text-id');
      assert.deepEqual(calls[0], ['text', '123@g.us', 'Alerta']);
      assert.equal(calls.filter(x => x[0] === 'text').length, 1);
      assert.equal(result.graphStatus, scenario === 'success' ? 'sent' : scenario.includes('failure') ? 'failed' : 'skipped');
      if (scenario === 'success') assert.deepEqual(calls[2], ['image', '123@g.us']);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });
}
