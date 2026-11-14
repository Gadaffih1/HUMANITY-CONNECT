import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { googleSignInError } from './googleAuthError.ts';

test('explains unauthorized Firebase domains and offers password login', () => {
  const error = googleSignInError({ code: 'auth/unauthorized-domain' }, 'example.test');
  assert.match(error.message, /example\.test/);
  assert.match(error.message, /authorized domains/);
  assert.match(error.message, /email and password/);
});

test('preserves unrelated sign-in errors', () => {
  const original = new Error('Popup closed');
  assert.equal(googleSignInError(original, 'example.test'), original);
});
