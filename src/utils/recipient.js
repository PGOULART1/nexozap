export function normalizeRecipient(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('Informe o telefone do destinatário, incluindo código do país e DDD.');
  }

  if (input.endsWith('@s.whatsapp.net') || input.endsWith('@g.us')) {
    return input;
  }

  const digits = input.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Telefone inválido. Use somente país + DDD + número, por exemplo: 5554999999999.');
  }

  return `${digits}@s.whatsapp.net`;
}
