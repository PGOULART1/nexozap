import { WhatsAppClient } from './whatsapp-client.js';
const client = new WhatsAppClient();
try {
  console.table(await client.listGroups());
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { client.stop(); }
