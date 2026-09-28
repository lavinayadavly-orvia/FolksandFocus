import { EXPERIENCE_TIERS } from '../experience.mjs';
import { ARCHETYPES, InputError, requireValue, text } from './models.mjs';
import { discoverNetwork, networkCandidates } from './network-discovery.mjs';

const reply = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
async function authenticate(request, env) {
  requireValue(typeof env.INTELLIGENCE_API_TOKEN === 'string' && env.INTELLIGENCE_API_TOKEN.length >= 32, 'Protected API is disabled until INTELLIGENCE_API_TOKEN is configured (minimum 32 characters)', 503);
  const given = request.headers.get('authorization') || '';
  const encode = value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const expected = new Uint8Array(await encode(`Bearer ${env.INTELLIGENCE_API_TOKEN}`));
  const actual = new Uint8Array(await encode(given));
  let difference = 0; for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
  requireValue(difference === 0, 'Authentication required', 401);
}
async function readJson(request) {
  requireValue(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 'Content-Type must be application/json', 415);
  requireValue(Number(request.headers.get('content-length') || 0) <= 1000000, 'Payload too large', 413);
  const reader = request.body?.getReader();
  requireValue(reader, 'JSON body is required', 400);
  const chunks = []; let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > 1000000) { await reader.cancel(); throw new InputError('Payload too large', 413); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  let input; try { input = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new InputError('Invalid JSON', 400); }
  requireValue(input && typeof input === 'object' && !Array.isArray(input), 'JSON object required');
  return input;
}
function integer(value, fallback, max) {
  if (value == null) return fallback;
  requireValue(/^\d+$/.test(String(value)) && Number(value) <= max, `Integer must be between 0 and ${max}`);
  return Number(value);
}

export async function intelligenceApi(request, { store, env = {}, now = new Date() }) {
  const url = new URL(request.url), path = url.pathname.replace(/^\/api\/intelligence\/?/, '');
  try {
    if (request.method === 'GET' && path === 'status') {
      if (store) await store.db.all('SELECT COUNT(*) AS count FROM intelligence_hcps');
      return reply({ framework_version: '2d-1', storage: store ? 'CONNECTED' : 'NOT_CONFIGURED',
        llm_processing: env.OPENAI_API_KEY && env.INTELLIGENCE_LLM_ENABLED === 'true' ? 'CONFIGURED' : 'NOT_CONFIGURED',
        live_social_connectors: 'NOT_CONFIGURED', x_network_discovery: env.X_DISCOVERY_ENABLED === 'true' && env.X_BEARER_TOKEN ? 'CONFIGURED_NOT_ACCESS_TESTED' : 'NOT_CONFIGURED', experience_tiers: EXPERIENCE_TIERS, behavioral_archetypes: ARCHETYPES });
    }
    requireValue(store, 'Intelligence database is not configured; bind INTELLIGENCE_DB and apply the schema', 503);
    if (request.method === 'GET' && path === 'summary') {
      const limit = integer(url.searchParams.get('limit'), 1000, 1000), offset = integer(url.searchParams.get('offset'), 0, 1000000);
      requireValue(limit > 0, 'limit must be positive');
      return reply({ items: await store.summaries(now, limit, offset), limit, offset, as_of: now.toISOString(), framework_version: '2d-1' });
    }
    await authenticate(request, env);
    const limit = integer(url.searchParams.get('limit'), 50, 100), offset = integer(url.searchParams.get('offset'), 0, 1000000);
    requireValue(limit > 0, 'limit must be positive');
    if (request.method === 'POST' && path === 'network/discover') return reply(await discoverNetwork(store, await readJson(request), env, now), 202);
    if (request.method === 'GET' && path === 'network/candidates') return reply(await networkCandidates(store, limit, offset));
    if (request.method === 'GET' && path === 'network/runs') return reply({ items: (await store.db.all('SELECT payload FROM intelligence_network_runs ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset])).map(r => JSON.parse(r.payload)), limit, offset });
    if (request.method === 'GET' && path === 'hcps') {
      const rows = await store.db.all('SELECT * FROM intelligence_hcps ORDER BY hcp_id LIMIT ? OFFSET ?', [limit, offset]);
      return reply({ items: rows.map(r => ({ ...JSON.parse(r.payload), revision: r.revision })), limit, offset });
    }
    const profile = path.match(/^hcps\/([\w-]+)$/);
    if (request.method === 'GET' && profile) {
      const person = await store.getProfile(profile[1]);
      requireValue(person, 'HCP not found', 404); return reply(person);
    }
    if ((request.method === 'POST' && path === 'hcps') || (request.method === 'PUT' && profile)) {
      const input = await readJson(request);
      requireValue(input.profile && typeof input.profile.hcp_id === 'string', 'profile.hcp_id is required');
      if (profile) requireValue(profile[1] === input.profile?.hcp_id, 'Path and profile identity mismatch');
      if (request.method === 'POST') requireValue(!(await store.getProfile(input.profile?.hcp_id)), 'HCP already exists; use PUT with expected_revision', 409);
      else requireValue(await store.getProfile(profile[1]), 'HCP not found', 404);
      const reason = text(input.reason, 'reason', 2000);
      return reply(await store.saveProfile(input.profile, { expectedRevision: input.expected_revision ?? null, reason }, now), request.method === 'POST' ? 201 : 200);
    }
    if (request.method === 'POST' && path === 'ingest') return reply(await store.ingest((await readJson(request)).posts, now), 202);
    if (request.method === 'POST' && path === 'process') {
      const input = await readJson(request), count = integer(input.limit, 5, 10);
      requireValue(count > 0, 'limit must be positive');
      return reply(await store.process(count, env, now));
    }
    if (request.method === 'GET' && path === 'analytics') {
      const tierId = url.searchParams.get('tier'), archetype = url.searchParams.get('archetype');
      const tier = tierId ? EXPERIENCE_TIERS.find(t => t.id === tierId) : null;
      requireValue(!tierId || tier, 'Unknown experience tier');
      requireValue(!archetype || ARCHETYPES.includes(archetype), 'Unknown archetype');
      return reply(await store.analytics({ tier, archetype, hcpId: url.searchParams.get('hcp_id'), limit, offset }, now));
    }
    if (request.method === 'GET' && path === 'safety') return reply({ items: (await store.safety(limit, offset)).map(r => ({ ...JSON.parse(r.payload), review_status: r.review_status, processed_at: r.processed_at })), limit, offset });
    if (request.method === 'POST' && path === 'safety/review') {
      const input = await readJson(request);
      return reply(await store.reviewSafety({ platform: text(input.platform, 'platform', 30), post_id: text(input.post_id, 'post_id', 128), status: input.status, reason: text(input.reason, 'reason', 2000), reviewer: text(input.reviewer, 'reviewer', 200) }, now));
    }
    if (request.method === 'GET' && path === 'queue') return reply({ items: await store.db.all('SELECT platform,post_id,hcp_id,status,attempts,last_error FROM intelligence_posts ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]) });
    if (request.method === 'GET' && path === 'audit') return reply({ items: await store.db.all('SELECT * FROM intelligence_audit ORDER BY at DESC LIMIT ? OFFSET ?', [limit, offset]) });
    return reply({ error: 'Endpoint not found' }, 404);
  } catch (error) {
    return reply({ error: error instanceof InputError ? error.message : 'Intelligence storage unavailable or operation failed' }, error instanceof InputError ? error.status : 503);
  }
}
