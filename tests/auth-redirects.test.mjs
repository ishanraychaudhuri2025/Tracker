import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { AUTH_REDIRECT_URL } from '../src/lib/auth-redirect.mjs';

test('auth email redirects use only the canonical production origin', async () => {
  assert.equal(AUTH_REDIRECT_URL, 'https://cadence-elite.vercel.app');
  const source = await readFile(new URL('../src/components/AuthScreen.tsx', import.meta.url), 'utf8');
  assert.match(source, /emailRedirectTo:\s*AUTH_REDIRECT_URL/);
  assert.match(source, /redirectTo:\s*AUTH_REDIRECT_URL/);
  assert.doesNotMatch(source, /emailRedirectTo:\s*window\.location\.origin/);
  assert.doesNotMatch(source, /redirectTo:\s*window\.location\.origin/);
});
