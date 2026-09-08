import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecipient } from '../src/utils/recipient.js';

test('normaliza telefone formatado para JID individual', () => {
  assert.equal(normalizeRecipient('+55 (54) 99999-9999'), '5554999999999@s.whatsapp.net');
});

test('preserva JIDs já normalizados', () => {
  assert.equal(normalizeRecipient('120363000000000000@g.us'), '120363000000000000@g.us');
});

test('rejeita telefone curto', () => {
  assert.throws(() => normalizeRecipient('1234'), /Telefone inválido/);
});
