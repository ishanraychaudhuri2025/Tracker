import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import testCase from 'node:test';

const migrationPath = new URL('../supabase/migrations/20261019053000_harden_phase3_security_and_pg_net.sql', import.meta.url);

testCase('push tables keep a restrictive deny-all policy for browser roles', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const tables = [
    'cadence_push_config',
    'cadence_push_subscriptions',
    'cadence_push_deliveries',
    'cadence_push_focus_timers',
  ];
  for (const table of tables) {
    assert.match(
      sql,
      new RegExp(
        'create policy "Deny client access to server-only table"\\s+on public\\.' +
          table +
          '\\s+as restrictive for all to anon, authenticated\\s+using \\(false\\) with check \\(false\\)',
        'i',
      ),
      table,
    );
    assert.match(sql, new RegExp('revoke all on table public\\.' + table + ' from public, anon, authenticated', 'i'));
  }
  assert.match(sql, /has_table_privilege\('authenticated'/i);
});

testCase('pg_net move is guarded, non-cascading, and preserves diagnostic rows', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /create temporary table pg_net_response_archive/i);
  assert.match(sql, /drop extension pg_net;\s*create extension pg_net with schema extensions;/i);
  assert.doesNotMatch(sql, /drop extension pg_net cascade/i);
  assert.match(sql, /from pg_temp\.pg_net_response_archive/i);
  assert.match(sql, /cron\.schedule\(/i);
  assert.match(sql, /pending_requests <> 0/i);
});

testCase('index retained for user-deletion cascade is documented and unused delivery index removed', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /drop index if exists public\.cadence_push_deliveries_created_idx/i);
  assert.match(sql, /intentionally retained for auth\.users on delete cascade/i);
});
