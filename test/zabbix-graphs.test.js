import test from 'node:test';
import assert from 'node:assert/strict';
import { ZabbixGraphs } from '../src/zabbix-graphs.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const login = () => new Response(null, { status: 302, headers: { location: 'zabbix.php?action=dashboard.view', 'set-cookie': 'zbx_session=secret; Path=/; Secure; HttpOnly' } });
const chart = () => new Response(png, { headers: { 'content-type': 'image/png' } });
const make = fetchImpl => new ZabbixGraphs({ url: 'https://monitor.example/zabbix/', username: 'reader', password: 'pass&word', fetchImpl });

test('login no frontend, cookie e gráfico; reutiliza sessão e preserva subdiretório', async () => {
  const calls = [];
  const graphs = make(async (url, options) => {
    calls.push([url, options]);
    return options.method === 'POST' ? login() : chart();
  });
  assert.deepEqual(await graphs.getGraph('123'), png);
  await graphs.getGraph('456');
  assert.equal(calls.length, 3);
  assert.equal(calls[0][0].pathname, '/zabbix/index.php');
  assert.equal(calls[0][1].body.get('password'), 'pass&word');
  assert.equal(calls[1][0].searchParams.get('itemids[0]'), '123');
  assert.equal(calls[1][0].searchParams.get('from'), 'now-1h');
  assert.equal(calls[1][1].headers.Cookie, 'zbx_session=secret');
  assert.equal(calls[1][1].redirect, 'manual');
});

test('login recusado entra em pausa sem repetir senha a cada alerta', async () => {
  let calls = 0;
  const graphs = make(async () => { calls++; return new Response('<html>login</html>'); });
  await assert.rejects(graphs.getGraph('123'), /Gráfico indisponível/);
  await assert.rejects(graphs.getGraph('123'), /pausa/);
  assert.equal(calls, 1);
});

test('sessão expirada faz um novo login antes do gráfico', async () => {
  const responses = [login(), chart(), new Response(null, { status: 302, headers: { location: 'index.php' } }), login(), chart()];
  const graphs = make(async () => responses.shift());
  await graphs.getGraph('123');
  assert.deepEqual(await graphs.getGraph('123'), png);
  assert.equal(responses.length, 0);
});

test('não segue redirecionamento externo ou MFA e rejeita HTML como imagem', async () => {
  for (const location of ['https://other.example/', 'index_mfa.php']) {
    let calls = 0;
    const graphs = make(async () => { calls++; return new Response(null, { status: 302, headers: { location } }); });
    await assert.rejects(graphs.getGraph('123'));
    assert.equal(calls, 1);
  }
  let calls = 0;
  const graphs = make(async () => ++calls === 1 ? login() : new Response('<html>Access denied</html>', { headers: { 'content-type': 'image/png' } }));
  await assert.rejects(graphs.getGraph('123'));
});

test('rejeita item inválido e URLs sem HTTPS sem fazer requisições', async () => {
  const graphs = make(() => { throw new Error('Não deveria requisitar'); });
  await assert.rejects(graphs.getGraph('https://other.example'), /ItemId inválido/);
  assert.throws(() => new ZabbixGraphs({ url: 'http://monitor.example', username: 'x', password: 'y' }));
});

test('timeout limita a espera e erro não expõe senha', async () => {
  const graphs = new ZabbixGraphs({ url: 'https://monitor.example', username: 'x', password: 'secret', timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout guard')), 100);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('secret')); }, { once: true });
    }),
  });
  await assert.rejects(graphs.getGraph('123'), error => !error.message.includes('secret'));
});
