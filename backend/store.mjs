import { verifiedExperience } from '../experience.mjs';
import { aggregateArchetypes } from './aggregation.mjs';
import { InputError, requireValue, validateProfile, validatePost } from './models.mjs';
import { extractPost } from './extraction.mjs';

const unpack = row => row ? { ...JSON.parse(row.payload), revision: row.revision, created_at: row.created_at, updated_at: row.updated_at } : null;
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const audit = (action, record, detail, now, actor = 'api-admin') => ['INSERT INTO intelligence_audit(id,at,actor,action,record_id,detail) VALUES(?,?,?,?,?,?)', [crypto.randomUUID(), now.toISOString(), actor, action, record, JSON.stringify(detail)]];

export class IntelligenceStore {
  constructor(db) { this.db = db; }
  async seedDossiers(people, now = new Date()) {
    if (!people.length) return;
    await this.db.batch(people.map(p => {
      const record = { hcp_id: p.id, name: p.name, primary_specialty: null, medical_registration_year: null, verification_status: 'PENDING', handles: {} };
      return ['INSERT OR IGNORE INTO intelligence_hcps(hcp_id,name,verification_status,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)', [p.id, p.name, 'PENDING', JSON.stringify(record), now.toISOString(), now.toISOString()]];
    }));
  }
  async getProfile(id) { return unpack((await this.db.all('SELECT * FROM intelligence_hcps WHERE hcp_id=?', [id]))[0]); }
  async saveProfile(input, { expectedRevision = null, reason = 'Verified cohort registration' } = {}, now = new Date()) {
    const profile = validateProfile(input, now), old = await this.getProfile(profile.hcp_id);
    requireValue(!old || expectedRevision === old.revision, 'Profile revision conflict; read latest profile and supply expected_revision', 409);
    const time = now.toISOString(), revision = (old?.revision || 0) + 1;
    // Insert-or-update with a revision guard; audit records are inserted only when the row changed.
    const command = old
      ? ['UPDATE intelligence_hcps SET name=?,primary_specialty=?,medical_registration_year=?,verification_status=?,payload=?,revision=?,updated_at=? WHERE hcp_id=? AND revision=?', [profile.name, profile.primary_specialty, profile.medical_registration_year, profile.verification_status, JSON.stringify(profile), revision, time, profile.hcp_id, expectedRevision]]
      : ['INSERT INTO intelligence_hcps(name,primary_specialty,medical_registration_year,verification_status,payload,revision,updated_at,hcp_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)', [profile.name, profile.primary_specialty, profile.medical_registration_year, profile.verification_status, JSON.stringify(profile), revision, time, profile.hcp_id, time]];
    const event = audit('COHORT_VERIFIED', profile.hcp_id, { reason, previous_registration_year: old?.medical_registration_year ?? null, registration_year: profile.medical_registration_year, source: profile.registration_source_url, verified_by: profile.verified_by }, now);
    event[0] = event[0].replace('VALUES(?,?,?,?,?,?)', 'SELECT ?,?,?,?,?,? WHERE changes()=1');
    try {
      const result = await this.db.batch([command, event]);
      requireValue(Number(result[0].meta.changes) === 1, 'Profile revision conflict', 409);
    } catch (error) { if (/UNIQUE/.test(error.message)) throw new InputError('Profile already exists', 409); throw error; }
    return this.getProfile(profile.hcp_id);
  }
  async ingest(inputs, now = new Date()) {
    requireValue(Array.isArray(inputs) && inputs.length > 0 && inputs.length <= 100, 'posts must contain 1-100 records');
    const commands = [], seen = new Map();
    let duplicates = 0;
    for (const input of inputs) {
      requireValue(input && typeof input.hcp_id === 'string', 'Every post requires hcp_id');
      const profile = await this.getProfile(input?.hcp_id);
      const post = validatePost(input, profile, now), key = JSON.stringify([post.platform, post.post_id]);
      const payload = JSON.stringify(post), fingerprint = await hash(payload);
      const previous = seen.get(key) || (await this.db.all('SELECT content_hash FROM intelligence_posts WHERE platform=? AND post_id=?', [post.platform, post.post_id]))[0]?.content_hash;
      requireValue(!previous || previous === fingerprint, 'Post identity already exists with different content or HCP', 409);
      if (previous) { duplicates++; continue; }
      seen.set(key, fingerprint);
      commands.push(['INSERT INTO intelligence_posts(platform,post_id,hcp_id,post_timestamp,payload,content_hash,created_at) VALUES(?,?,?,?,?,?,?)', [post.platform, post.post_id, post.hcp_id, post.timestamp, payload, fingerprint, now.toISOString()]]);
      commands.push(audit('POST_INGESTED', key, { hcp_id: post.hcp_id, collection_basis: post.collection_basis, source_url: post.source_url }, now));
    }
    if (commands.length) {
      try { await this.db.batch(commands); }
      catch (error) { if (/UNIQUE/.test(error.message)) throw new InputError('Concurrent duplicate ingest; retry the same batch', 409); throw error; }
    }
    return { accepted: seen.size, duplicates, extraction_status: 'PENDING' };
  }
  async summaries(now = new Date(), limit = 1000, offset = 0) {
    const profiles = await this.db.all('SELECT * FROM intelligence_hcps ORDER BY hcp_id LIMIT ? OFFSET ?', [limit, offset]);
    const start = new Date(now.getTime() - 90 * 86400000).toISOString();
    const recent = profiles.length ? await this.db.all('SELECT p.hcp_id,p.platform,p.post_id,p.post_timestamp AS timestamp,e.extracted_archetype FROM intelligence_posts p JOIN intelligence_extractions e ON e.platform=p.platform AND e.post_id=p.post_id WHERE p.post_timestamp>=? AND p.post_timestamp<=? AND p.hcp_id IN (SELECT hcp_id FROM intelligence_hcps ORDER BY hcp_id LIMIT ? OFFSET ?)', [start, now.toISOString(), limit, offset]) : [];
    return profiles.map(row => {
      const p = unpack(row), tier = verifiedExperience(p, now);
      return { hcp_id: p.hcp_id, name: p.name, primary_specialty: p.primary_specialty, verification_status: p.verification_status,
        years_of_experience: tier?.years ?? null, experience_tier: tier?.id ?? null, persona_label: tier?.label ?? 'Awaiting classification',
        registration_source_url: p.registration_source_url ?? null,
        ...aggregateArchetypes(recent.filter(r => r.hcp_id === p.hcp_id), now) };
    });
  }
  async process(limit, config, now = new Date(), extractor = extractPost) {
    requireValue(config.OPENAI_API_KEY, 'OPENAI_API_KEY is not configured', 503);
    requireValue(config.INTELLIGENCE_LLM_ENABLED === 'true', 'LLM processing requires INTELLIGENCE_LLM_ENABLED=true after privacy and provider review', 503);
    const rows = await this.db.all("SELECT * FROM intelligence_posts WHERE (status IN ('PENDING','FAILED') OR (status='PROCESSING' AND lease_until<?)) AND attempts<3 ORDER BY created_at LIMIT ?", [now.toISOString(), limit]);
    const results = [];
    for (const row of rows) {
      const lease = crypto.randomUUID(), until = new Date(Date.now() + 120000).toISOString();
      const claimed = await this.db.batch([['UPDATE intelligence_posts SET status=\'PROCESSING\',lease_token=?,lease_until=?,attempts=attempts+1 WHERE platform=? AND post_id=? AND attempts<3 AND (status IN (\'PENDING\',\'FAILED\') OR (status=\'PROCESSING\' AND lease_until<?))', [lease, until, row.platform, row.post_id, now.toISOString()]]]);
      if (!Number(claimed[0].meta.changes)) continue;
      try {
        const post = JSON.parse(row.payload), profile = await this.getProfile(row.hcp_id);
        validatePost(post, profile, new Date());
        const result = await extractor(post, config), at = new Date().toISOString();
        const event = audit('POST_EXTRACTED', `${row.platform}:${row.post_id}`, { model: result.model, prompt_version: result.prompt_version }, new Date());
        event[0] = event[0].replace('VALUES(?,?,?,?,?,?)', 'SELECT ?,?,?,?,?,? WHERE changes()=1');
        const saved = await this.db.batch([
          ['INSERT INTO intelligence_extractions(platform,post_id,hcp_id,extracted_archetype,pv_complete,pv_review_required,payload,model,prompt_version,processed_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM intelligence_posts WHERE platform=? AND post_id=? AND lease_token=?)', [row.platform, row.post_id, row.hcp_id, result.extracted_archetype, Number(result.pv_adverse_event_suspected), Number(result.pv_review_required), JSON.stringify(result), result.model, result.prompt_version, at, row.platform, row.post_id, lease]],
          ["UPDATE intelligence_posts SET status='COMPLETE',lease_token=NULL,lease_until=NULL,last_error=NULL WHERE platform=? AND post_id=? AND lease_token=?", [row.platform, row.post_id, lease]],
          event
        ]);
        results.push({ platform: row.platform, post_id: row.post_id, status: Number(saved[0].meta.changes) ? 'COMPLETE' : 'LEASE_LOST' });
      } catch (error) {
        const message = error instanceof InputError ? error.message : 'Processing failed; retry or review manually';
        await this.db.batch([["UPDATE intelligence_posts SET status='FAILED',lease_token=NULL,lease_until=NULL,last_error=? WHERE platform=? AND post_id=? AND lease_token=?", [message, row.platform, row.post_id, lease]]]);
        results.push({ platform: row.platform, post_id: row.post_id, status: 'FAILED', error: message });
      }
    }
    return { items: results, retry_limit: 3 };
  }
  async analytics({ tier, archetype, hcpId, limit, offset }, now = new Date()) {
    const where = ['p.post_timestamp>=?', 'p.post_timestamp<=?'];
    const params = [new Date(now.getTime() - 90 * 86400000).toISOString(), now.toISOString()];
    if (tier) { where.push('h.verification_status=\'VERIFIED\' AND (? - h.medical_registration_year)>=? AND (? - h.medical_registration_year)<=?'); params.push(now.getUTCFullYear(), tier.min, now.getUTCFullYear(), tier.max ?? 10000); }
    if (archetype) { where.push('e.extracted_archetype=?'); params.push(archetype); }
    if (hcpId) { where.push('p.hcp_id=?'); params.push(hcpId); }
    const from = `FROM intelligence_posts p JOIN intelligence_hcps h ON h.hcp_id=p.hcp_id LEFT JOIN intelligence_extractions e ON e.platform=p.platform AND e.post_id=p.post_id WHERE ${where.join(' AND ')}`;
    const total = (await this.db.all(`SELECT COUNT(*) AS count ${from}`, params))[0].count;
    const rows = await this.db.all(`SELECT p.payload,p.status,p.last_error,e.payload AS extraction,e.review_status ${from} ORDER BY p.post_timestamp DESC,p.platform,p.post_id LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { total, limit, offset, items: rows.map(row => ({ ...JSON.parse(row.payload), processing_status: row.status, last_error: row.last_error, extraction: row.extraction ? { ...JSON.parse(row.extraction), review_status: row.review_status } : null })) };
  }
  async safety(limit, offset) {
    return this.db.all('SELECT platform,post_id,hcp_id,pv_complete,review_status,payload,processed_at FROM intelligence_extractions WHERE pv_review_required=1 ORDER BY processed_at DESC LIMIT ? OFFSET ?', [limit, offset]);
  }
  async reviewSafety(input, now = new Date()) {
    requireValue(['CONFIRMED', 'DISMISSED'].includes(input.status), 'Review status must be CONFIRMED or DISMISSED');
    const row = (await this.db.all('SELECT review_status FROM intelligence_extractions WHERE platform=? AND post_id=? AND pv_review_required=1', [input.platform, input.post_id]))[0];
    requireValue(row, 'Safety screening record not found', 404);
    requireValue(row.review_status === 'PENDING', 'Safety screening already reviewed', 409);
    const event = audit('PV_REVIEWED', `${input.platform}:${input.post_id}`, { status: input.status, reason: input.reason, reviewer: input.reviewer }, now);
    event[0] = event[0].replace('VALUES(?,?,?,?,?,?)', 'SELECT ?,?,?,?,?,? WHERE changes()=1');
    const result = await this.db.batch([["UPDATE intelligence_extractions SET review_status=? WHERE platform=? AND post_id=? AND review_status='PENDING'", [input.status, input.platform, input.post_id]], event]);
    requireValue(Number(result[0].meta.changes) === 1, 'Concurrent safety review conflict', 409);
    return { status: input.status, regulatory_submission: false };
  }
}
