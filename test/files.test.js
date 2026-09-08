import test from 'node:test';
import assert from 'node:assert/strict';
import { mimeTypeFor } from '../src/utils/files.js';

test('identifica PDF sem diferenciar maiúsculas', () => {
  assert.equal(mimeTypeFor('Contrato.PDF'), 'application/pdf');
});

test('usa tipo binário genérico para extensão desconhecida', () => {
  assert.equal(mimeTypeFor('arquivo.xyz'), 'application/octet-stream');
});
