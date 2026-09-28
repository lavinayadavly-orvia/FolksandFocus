import test from 'node:test';
import assert from 'node:assert/strict';
import { openLocalDatabase } from './local-database.mjs';
import { discoverNetwork, screenBio, networkCandidates } from './network-discovery.mjs';
import { intelligenceApi } from './api.mjs';

const env = { X_DISCOVERY_ENABLED: 'true', X_BEARER_TOKEN: 'test-only' };
const now = new Date('2026-09-28T00:00:00Z');
async function fixture(t) {
  const db = await openLocalDatabase(':memory:'); t.after(() => db.close());
  const profile = { hcp_id: 'seed', verification_status: 'VERIFIED', handles: { x: { handle: '@seed', verified_at: '2026-09-27T00:00:00Z', source_url: 'https://example.org/doctor' } } };
  await db.batch([['INSERT INTO intelligence_hcps(hcp_id,name,verification_status,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)', ['seed', 'Test Seed', 'VERIFIED', JSON.stringify(profile), now.toISOString(), now.toISOString()]]]);
  return { db, getProfile: async () => profile };
}
const input = { seed_hcp_id: 'seed', direction: 'following' };
function mocked(page, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.includes('/by/username/') ? { data: { id: '1', username: 'seed' } } : page);
  };
}
test('bio filter uses credential boundaries and keeps ambiguous language separate', () => {
  assert.equal(screenBio('Endocrinologist MBBS, Delhi').classification, 'CLINICAL_SIGNAL');
  assert.equal(screenBio('Consultant MD, DM for marketing').classification, 'AMBIGUOUS');
  assert.equal(screenBio('Admin at a company').classification, 'NO_SIGNAL');
  assert.equal(screenBio('Consultant physician').identity_status, 'UNVERIFIED');
  assert.equal(screenBio('Cardiologist in London').india_practice_status, 'UNVERIFIED');
});
test('discovery is credential gated and rejects unverified seeds before any network call', async t => {
  const store = await fixture(t);
  await assert.rejects(discoverNetwork(store, input, {}, now), /requires X_BEARER_TOKEN/);
  store.getProfile = async () => ({ verification_status: 'PENDING' });
  await assert.rejects(discoverNetwork(store, input, env, now, () => assert.fail('must not fetch')), /verified HCP/);
});
test('pages persist candidates and edges without promoting HCPs; replay deduplicates', async t => {
  const store = await fixture(t), calls = [];
  const page = { data: [
    { id: '2', username: 'doctor', name: 'Test Doctor', description: 'Endocrinologist', location: 'India', email: 'discard@example.org' },
    { id: '3', username: 'consultant', name: 'Consultant', description: 'MD business consultant' },
    { id: '4', username: 'reader', name: 'Reader', description: 'Books' }
  ], meta: { result_count: 3, next_token: 'next-page' } };
  const first = await discoverNetwork(store, input, env, now, mocked(page, calls));
  assert.equal(first.verified_hcps_added, 0);
  assert.equal(first.traversal_status, 'MORE_PAGES');
  assert.equal(first.clinical_signal, 1);
  await discoverNetwork(store, input, env, now, mocked(page));
  const candidates = await networkCandidates(store, 50, 0);
  assert.equal(candidates.total, 2);
  assert.equal(candidates.items[0].seed_connections, 1);
  assert.equal(JSON.stringify(candidates).includes('discard@example'), false);
  assert.equal((await store.db.all('SELECT * FROM intelligence_network_edges')).length, 2);
  assert.equal((await store.db.all('SELECT * FROM intelligence_hcps')).length, 1);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /max_results=100/);
});
test('continuation passes token; empty final page is not a failed fetch', async t => {
  const store = await fixture(t), calls = [];
  const result = await discoverNetwork(store, { ...input, pagination_token: 'page-2' }, env, now, mocked({ meta: { result_count: 0 } }, calls));
  assert.equal(result.traversal_status, 'END_OF_TRAVERSAL');
  assert.match(calls[1].url, /pagination_token=page-2/);
});
test('rate limits, partial errors and malformed pages do not write candidates', async t => {
  const store = await fixture(t);
  await assert.rejects(discoverNetwork(store, input, env, now, async () => new Response('', { status: 429 })), /429/);
  await assert.rejects(discoverNetwork(store, input, env, now, mocked({ errors: [{ title: 'denied' }] })), /returned errors/);
  await assert.rejects(discoverNetwork(store, input, env, now, mocked({ data: [], meta: { result_count: 2 } })), /count mismatch/);
  assert.equal((await networkCandidates(store, 50, 0)).total, 0);
  assert.equal((await store.db.all('SELECT * FROM intelligence_network_runs')).length, 0);
});
test('network endpoints are protected and paginated', async t => {
  const store = await fixture(t), apiEnv = { INTELLIGENCE_API_TOKEN: 'a'.repeat(32) };
  const url = 'https://example.org/api/intelligence/network/candidates';
  assert.equal((await intelligenceApi(new Request(url), { store, env: apiEnv })).status, 401);
  const response = await intelligenceApi(new Request(url, { headers: { authorization: `Bearer ${apiEnv.INTELLIGENCE_API_TOKEN}` } }), { store, env: apiEnv });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 0);
});
