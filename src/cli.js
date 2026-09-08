import { WhatsAppClient } from './whatsapp-client.js';
import { logger } from './logger.js';

function showHelp() {
  console.log(`
NexoZap — comandos disponíveis

  npm run login
  npm run send:text -- 5554999999999 "Olá!"
  npm run send:file -- 5554999999999 ./documento.pdf "Legenda opcional"

O telefone deve incluir código do país e DDD, sem o sinal de +.
  `);
}

async function keepRunningUntilSignal() {
  await new Promise((resolve) => {
    const finish = () => {
      process.off('SIGINT', finish);
      process.off('SIGTERM', finish);
      resolve();
    };
    process.on('SIGINT', finish);
    process.on('SIGTERM', finish);
  });
}

async function main() {
  const [command = 'help', recipient, ...values] = process.argv.slice(2);
  if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  const client = new WhatsAppClient();

  if (command === 'login') {
    try {
      await client.connect();
      logger.info('NexoZap está pronto. Pressione Ctrl+C para encerrar.');
      await keepRunningUntilSignal();
    } finally {
      client.stop();
    }
    return;
  }

  try {
    if (command === 'text') {
      await client.sendText(recipient, values.join(' '));
    } else if (command === 'file') {
      const [filePath, ...caption] = values;
      if (!filePath) throw new Error('Informe o caminho do arquivo.');
      await client.sendFile(recipient, filePath, caption.join(' '));
    } else {
      throw new Error(`Comando desconhecido: ${command}`);
    }
  } finally {
    client.stop();
  }
}

main().catch((error) => {
  logger.error({ err: error }, 'Não foi possível concluir o comando.');
  process.exitCode = 1;
});
