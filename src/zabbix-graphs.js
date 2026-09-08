// Zabbix 7.0 frontend session: chart.php does not use an API bearer token.
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class ZabbixGraphs {
  #cookie = '';
  #retryAfter = 0;

  constructor({ url, username, password, fetchImpl = fetch, timeoutMs = 8000, cooldownMs = 300000 }) {
    this.base = new URL(url);
    if (this.base.protocol !== 'https:' || this.base.username || this.base.password || this.base.search || this.base.hash) {
      throw new Error('ZABBIX_URL deve ser HTTPS, sem credenciais, query ou fragmento.');
    }
    if (!this.base.pathname.endsWith('/')) this.base.pathname += '/';
    if (!username || !password) throw new Error('Configure usuário e senha do frontend Zabbix.');
    this.username = username;
    this.password = password;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cooldownMs = cooldownMs;
  }

  async #read(response, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body || []) {
      size += chunk.length;
      if (size > limit) throw new Error('Resposta do Zabbix excede o limite.');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async #login(signal) {
    const response = await this.fetch(new URL('index.php', this.base), {
      method: 'POST', redirect: 'manual', signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: this.username, password: this.password, enter: 'Sign in', autologin: '1' }),
    });
    const location = response.headers.get('location');
    const cookies = response.headers.getSetCookie();
    await this.#read(response, 256 * 1024);
    // Never follow redirects with credentials. MFA, SSO and failed login are unsupported.
    if (![302, 303].includes(response.status) || !location) throw new Error('Login Zabbix recusado.');
    const target = new URL(location, this.base);
    if (target.origin !== this.base.origin || /index(?:_mfa|_sso|_http)?\.php$/.test(target.pathname)) {
      throw new Error('Login Zabbix não concluiu ou exige autenticação adicional.');
    }
    const session = cookies.map(value => value.split(';')[0]).find(value => /^zbx_session=.+/.test(value));
    if (!session) throw new Error('Cookie de sessão Zabbix não recebido.');
    this.#cookie = session;
  }

  async #chart(itemId, signal) {
    const url = new URL('chart.php', this.base);
    url.search = new URLSearchParams({ 'itemids[0]': itemId, from: 'now-1h', to: 'now', width: '1000', height: '300', legend: '1' }).toString();
    const response = await this.fetch(url, { redirect: 'manual', signal, headers: { Cookie: this.#cookie } });
    const image = await this.#read(response, 5 * 1024 * 1024);
    if (response.status !== 200 || !response.headers.get('content-type')?.toLowerCase().startsWith('image/png')) {
      throw new Error('Gráfico indisponível: confira sessão, item e permissões.');
    }
    if (image.length < 33 || !image.subarray(0, 8).equals(PNG) || image.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error('O Zabbix não retornou uma imagem PNG válida.');
    }
    const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
    if (!width || !height || width > 4096 || height > 4096) throw new Error('Dimensões de gráfico inválidas.');
    return image;
  }

  async getGraph(itemId) {
    if (typeof itemId !== 'string' || !/^[1-9]\d{0,19}$/.test(itemId)) throw new Error('ItemId inválido.');
    if (Date.now() < this.#retryAfter) throw new Error('Busca de gráficos em pausa após falha; confira configuração.');
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      const hadSession = Boolean(this.#cookie);
      if (!hadSession) await this.#login(signal);
      try { return await this.#chart(itemId, signal); }
      catch (error) {
        if (!hadSession || signal.aborted) throw error;
        this.#cookie = '';
        await this.#login(signal);
        return await this.#chart(itemId, signal);
      }
    } catch {
      this.#cookie = '';
      this.#retryAfter = Date.now() + this.cooldownMs;
      // Avoid leaking cookies, passwords, request bodies or upstream HTML in logs.
      throw new Error('Gráfico indisponível. Confira login, permissões, item, HTTPS e acesso ao frontend. Nova tentativa em 5 minutos.');
    }
  }
}
