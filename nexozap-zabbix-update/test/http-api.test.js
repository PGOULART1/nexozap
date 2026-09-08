import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/http-api.js';

test('API autentica, valida e envia somente ao grupo configurado', async () => {
  const sent = [];
  const client = { isConnected: true, async sendText(...args) { sent.push(args); return { key: { id: 'test' } }; } };
  const token = 'a'.repeat(32);
  const server = createApi({ client, token, groupId: '123@g.us', logger: { error() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/alerts`;
  const post = (data, auth = token) => fetch(url, { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify(data) });
  try {
    assert.equal((await post({ text: 'teste' }, 'wrong')).status, 401);
    assert.equal((await post({ text: '' })).status, 400);
    assert.equal((await post({ text: 'Atenção: recuperação', recipient: '999@g.us' })).status, 200);
    assert.deepEqual(sent, [['123@g.us', 'Atenção: recuperação']]);
    client.isConnected = false;
    assert.equal((await post({ text: 'teste' })).status, 503);
    assert.equal(sent.length, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
