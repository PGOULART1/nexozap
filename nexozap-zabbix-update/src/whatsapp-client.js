import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { config } from './config.js';
import { logger } from './logger.js';
import { mimeTypeFor } from './utils/files.js';
import { normalizeRecipient } from './utils/recipient.js';

export class WhatsAppClient {
  #socket;
  #connectingPromise;
  #connected = false;
  #stopped = false;
  #reconnectAttempt = 0;
  #reconnectTimer;
  #connectionWaiters = new Set();

  get isConnected() {
    return this.#connected;
  }

  async start() {
    this.#stopped = false;
    if (!this.#connectingPromise && !this.#connected) {
      this.#connectingPromise = this.#createSocket().finally(() => {
        this.#connectingPromise = undefined;
      });
    }
    return this.#connectingPromise;
  }

  async #createSocket() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDirectory);

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.ubuntu(config.appName),
      logger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    this.#socket = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => this.#handleConnectionUpdate(socket, update));
    logger.info({ sessionDirectory: config.sessionDirectory }, 'Conexão com o WhatsApp iniciada.');
  }

  #handleConnectionUpdate(socket, { connection, lastDisconnect, qr }) {
    if (socket !== this.#socket) return;

    if (qr) {
      logger.info('Escaneie o QR Code no WhatsApp: Aparelhos conectados > Conectar um aparelho.');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      this.#connected = true;
      this.#reconnectAttempt = 0;
      logger.info({ user: socket.user?.id }, 'WhatsApp conectado.');
      this.#settleConnectionWaiters();
      return;
    }

    if (connection !== 'close') return;

    this.#connected = false;
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    if (loggedOut) {
      const error = new Error('Sessão encerrada pelo WhatsApp. Remova a pasta de sessão e faça o login novamente.');
      logger.error({ statusCode }, error.message);
      this.#settleConnectionWaiters(error);
      return;
    }

    if (!this.#stopped) {
      logger.warn({ statusCode }, 'Conexão encerrada; uma reconexão será tentada automaticamente.');
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer || this.#stopped) return;

    const exponentialDelay = config.reconnectInitialDelayMs * 2 ** this.#reconnectAttempt;
    const delay = Math.min(exponentialDelay, config.reconnectMaxDelayMs);
    this.#reconnectAttempt += 1;

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      this.start().catch((error) => {
        logger.error({ err: error }, 'Não foi possível recriar a conexão.');
        this.#scheduleReconnect();
      });
    }, delay);

    logger.info({ delayMs: delay, attempt: this.#reconnectAttempt }, 'Reconexão agendada.');
  }

  waitUntilConnected(timeoutMs = config.connectTimeoutMs) {
    if (this.#connected) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: undefined };
      waiter.timer = setTimeout(() => {
        this.#connectionWaiters.delete(waiter);
        reject(new Error(`O WhatsApp não conectou em ${timeoutMs / 1000} segundos.`));
      }, timeoutMs);
      this.#connectionWaiters.add(waiter);
    });
  }

  #settleConnectionWaiters(error) {
    for (const waiter of this.#connectionWaiters) {
      clearTimeout(waiter.timer);
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
    this.#connectionWaiters.clear();
  }

  async connect() {
    await this.start();
    await this.waitUntilConnected();
    return this;
  }

  async sendText(recipient, text) {
    if (!text?.trim()) throw new Error('A mensagem não pode estar vazia.');
    await this.connect();

    const jid = normalizeRecipient(recipient);
    const result = await this.#socket.sendMessage(jid, { text });
    logger.info({ recipient: jid, messageId: result.key.id }, 'Mensagem de texto enviada.');
    return result;
  }

  async listGroups() {
    await this.connect();
    const groups = await this.#socket.groupFetchAllParticipating();
    return Object.values(groups).map(({ id, subject }) => ({ id, name: subject }));
  }

  async sendFile(recipient, filePath, caption = '') {
    const absolutePath = path.resolve(filePath);
    const fileInfo = await stat(absolutePath);
    if (!fileInfo.isFile()) throw new Error('O caminho informado não aponta para um arquivo.');
    if (fileInfo.size > config.maxFileSizeBytes) {
      throw new Error(`O arquivo excede o limite configurado de ${config.maxFileSizeBytes / 1024 / 1024} MiB.`);
    }

    await this.connect();
    const jid = normalizeRecipient(recipient);
    const result = await this.#socket.sendMessage(jid, {
      document: await readFile(absolutePath),
      fileName: path.basename(absolutePath),
      mimetype: mimeTypeFor(absolutePath),
      ...(caption ? { caption } : {}),
    });

    logger.info(
      { recipient: jid, fileName: path.basename(absolutePath), messageId: result.key.id },
      'Arquivo enviado.',
    );
    return result;
  }

  stop() {
    this.#stopped = true;
    this.#connected = false;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    this.#socket?.end(undefined);
    this.#socket = undefined;
    this.#settleConnectionWaiters(new Error('Cliente encerrado.'));
    logger.info('Cliente encerrado sem apagar a sessão.');
  }
}
