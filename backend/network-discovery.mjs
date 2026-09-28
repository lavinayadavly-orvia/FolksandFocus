import { InputError, requireValue, text } from './models.mjs';
import { screenProfile } from './profile-screening.mjs';

// Discovery signals are self-descriptions, never medical identity verification.
export function screenBio(bio = '') {
  return screenProfile({ bio });
}

async function xJson(path, env, fetcher) {
  let response;
  try {
    response = await fetcher(`https://api.x.com/2/${path}`, {
      headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
      redirect: 'error', signal: AbortSignal.timeout(20000)
    });
  } catch { throw new InputError('X request failed or timed out; no automatic retry was made', 502); }
  if (!response.ok) throw new InputError(`X returned HTTP ${response.status}; discovery stopped without retry`, response.status === 429 ? 429 : 502);
  let body;
  try { body = await response.json(); } catch { throw new InputError('Invalid X response', 502); }
  requireValue(body && !body.errors?.length, 'X returned errors; page was not imported', 502);
  return body;
}

export async function discoverNetwork(store, input, env, now = new Date(), fetcher = fetch) {
  requireValue(env.X_DISCOVERY_ENABLED === 'true' && env.X_BEARER_TOKEN, 'X discovery requires X_BEARER_TOKEN and X_DISCOVERY_ENABLED=true', 503);
  const seedId = text(input.seed_hcp_id, 'seed_hcp_id', 64);
  requireValue(['followers', 'following'].includes(input.direction), 'direction must be followers or following');
  const cursor = input.pagination_token == null ? null : text(input.pagination_token, 'pagination_token', 2048);
  const seed = await store.getProfile(seedId);
  requireValue(seed?.verification_status === 'VERIFIED' && seed.handles?.x?.verified_at && seed.handles.x.source_url, 'A verified HCP and verified X handle are required');
  const username = seed.handles.x.handle.replace(/^@/, '');
  requireValue(/^[A-Za-z0-9_]{1,15}$/.test(username), 'Seed X handle must be a username, not a URL');
  const lookup = await xJson(`users/by/username/${username}`, env, fetcher);
  requireValue(/^\d+$/.test(lookup.data?.id || '') && lookup.data?.username?.toLowerCase() === username.toLowerCase(), 'X seed identity lookup failed', 502);
  const params = new URLSearchParams({ max_results: '100', 'user.fields': 'description,location' });
  if (cursor) params.set('pagination_token', cursor);
  const path = `users/${lookup.data.id}/${input.direction}?${params}`;
  const page = await xJson(path, env, fetcher);
  requireValue(page.meta && Number.isInteger(page.meta.result_count) && page.meta.result_count >= 0, 'X page metadata missing', 502);
  const users = page.data ?? [];
  requireValue(Array.isArray(users) && users.length <= 100 && users.length === page.meta.result_count, 'X page count mismatch', 502);
  const next = page.meta.next_token ?? null;
  requireValue(next === null || (typeof next === 'string' && next.length > 0 && next.length <= 2048 && next !== cursor), 'Invalid X continuation token', 502);
  const runId = crypto.randomUUID(), at = now.toISOString(), commands = [];
  const counts = { examined: users.length, clinical_signal: 0, ambiguous: 0, no_signal: 0 };
  const seen = new Set();
  for (const user of users) {
    requireValue(typeof user.id === 'string' && /^\d+$/.test(user.id) && /^[A-Za-z0-9_]{1,15}$/.test(user.username || ''), 'Malformed X account', 502);
    requireValue(typeof user.name === 'string' && typeof (user.description ?? '') === 'string' && typeof (user.location ?? '') === 'string', 'Malformed X public profile', 502);
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    const bio = user.description ?? '', assessment = screenProfile({ name: user.name, bio }, now);
    counts[assessment.classification.toLowerCase()]++;
    if (assessment.classification === 'NO_SIGNAL' || user.id === lookup.data.id) continue;
    const payload = JSON.stringify({ account_id: user.id, username: user.username, name: user.name,
      bio, declared_location: user.location ?? '', source_url: `https://x.com/${user.username}`, ...assessment });
    commands.push(['INSERT INTO intelligence_network_candidates(account_id,payload,first_seen,last_seen) VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen', [user.id, payload, at, at]]);
    commands.push(['INSERT INTO intelligence_network_edges(seed_hcp_id,seed_account_id,candidate_id,direction,source_url,first_seen,last_seen) VALUES(?,?,?,?,?,?,?) ON CONFLICT(seed_hcp_id,seed_account_id,candidate_id,direction) DO UPDATE SET last_seen=excluded.last_seen,source_url=excluded.source_url', [seedId, lookup.data.id, user.id, input.direction, `https://api.x.com/2/${path}`, at, at]]);
  }
  const result = { run_id: runId, seed_hcp_id: seedId, direction: input.direction, ...counts,
    next_token: next, traversal_status: next ? 'MORE_PAGES' : 'END_OF_TRAVERSAL', verified_hcps_added: 0, collected_at: at };
  commands.push(['INSERT INTO intelligence_network_runs(id,payload,created_at) VALUES(?,?,?)', [runId, JSON.stringify(result), at]]);
  commands.push(['INSERT INTO intelligence_audit(id,at,actor,action,record_id,detail) VALUES(?,?,?,?,?,?)', [crypto.randomUUID(), at, 'api', 'network_discovery', runId, JSON.stringify(result)]]);
  await store.db.batch(commands);
  return result;
}

export async function networkCandidates(store, limit, offset) {
  const rows = await store.db.all('SELECT c.*, (SELECT COUNT(DISTINCT e.seed_hcp_id) FROM intelligence_network_edges e WHERE e.candidate_id=c.account_id) AS seed_connections FROM intelligence_network_candidates c ORDER BY seed_connections DESC,c.account_id LIMIT ? OFFSET ?', [limit, offset]);
  const totals = await store.db.all('SELECT COUNT(*) AS count FROM intelligence_network_candidates');
  return { items: rows.map(r => ({ ...JSON.parse(r.payload), first_seen: r.first_seen, last_seen: r.last_seen, seed_connections: r.seed_connections })), total: totals[0].count, limit, offset };
}
