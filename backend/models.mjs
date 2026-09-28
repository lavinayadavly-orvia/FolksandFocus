export const ARCHETYPES = Object.freeze(['Trial_Dissector', 'Frontline_Pragmatist', 'Congress_Broadcaster', 'Peer_Educator', 'Skeptic_Contrarian', 'Access_Policy_Advocate']);
export const SPECIALTIES = Object.freeze(['Endocrinology', 'Cardiology', 'Diabetology', 'General_Practice', 'General_Medicine', 'Gynecology_Obstetrics']);
export const PLATFORMS = Object.freeze(['x', 'instagram', 'youtube', 'linkedin', 'substack', 'podcast', 'blog']);
export const PV_CRITERIA = Object.freeze(['identifiable_patient', 'identifiable_reporter', 'suspect_product', 'adverse_event']);
export class InputError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}
export function requireValue(condition, message, status) { if (!condition) throw new InputError(message, status); }
export function text(value, name, max = 1000) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name} must be nonempty text, at most ${max} characters`);
  return value.trim();
}
export function sourceUrl(value, name) {
  text(value, name, 2048);
  let url; try { url = new URL(value); } catch { throw new InputError(`${name} must be an HTTPS URL`); }
  requireValue(url.protocol === 'https:' && !url.username && !url.password, `${name} must be an HTTPS URL without credentials`);
  return url.href;
}
export function timestamp(value, name, now = new Date()) {
  const parts = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  requireValue(parts, `${name} requires an ISO timestamp with timezone`);
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  requireValue(month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour <= 23 && minute <= 59 && second <= 59, `${name} has invalid calendar fields`);
  const date = new Date(value);
  requireValue(Number.isFinite(date.getTime()) && date <= now, `${name} must be a valid non-future timestamp`);
  return date.toISOString();
}
function exactKeys(input, allowed) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input), 'Expected an object');
  for (const key of Object.keys(input)) requireValue(allowed.includes(key), `Unsupported field: ${key}`);
}
export function validateProfile(input, now = new Date()) {
  exactKeys(input, ['hcp_id', 'name', 'primary_specialty', 'sub_specialties', 'medical_registration_year', 'medical_council_id', 'registration_source_url', 'verified_by', 'verified_at', 'handles']);
  const id = text(input.hcp_id, 'hcp_id', 64);
  requireValue(/^[\w-]+$/.test(id), 'hcp_id must use letters, numbers, underscores or hyphens');
  requireValue(SPECIALTIES.includes(input.primary_specialty), 'Unsupported primary_specialty');
  requireValue(Number.isInteger(input.medical_registration_year) && input.medical_registration_year >= 1950 && input.medical_registration_year <= now.getUTCFullYear(), 'medical_registration_year must be 1950 through the current year');
  const sub = input.sub_specialties ?? [];
  requireValue(Array.isArray(sub) && sub.length <= 20, 'sub_specialties must be an array of at most 20');
  const handles = input.handles ?? {};
  exactKeys(handles, PLATFORMS);
  const resolved = {};
  for (const [platform, account] of Object.entries(handles)) {
    exactKeys(account, ['handle', 'source_url', 'verified_at']);
    resolved[platform] = { handle: text(account.handle, 'handle', 500), source_url: sourceUrl(account.source_url, 'handle source_url'), verified_at: timestamp(account.verified_at, 'handle verified_at', now) };
  }
  return { hcp_id: id, name: text(input.name, 'name', 255), primary_specialty: input.primary_specialty,
    sub_specialties: sub.map(s => text(s, 'sub_specialty', 100)), medical_registration_year: input.medical_registration_year,
    medical_council_id: input.medical_council_id == null ? null : text(input.medical_council_id, 'medical_council_id', 128),
    registration_source_url: sourceUrl(input.registration_source_url, 'registration_source_url'),
    verified_by: text(input.verified_by, 'verified_by', 200), verified_at: timestamp(input.verified_at, 'verified_at', now),
    verification_status: 'VERIFIED', handles: resolved };
}
export function validatePost(input, profile, now = new Date()) {
  exactKeys(input, ['post_id', 'hcp_id', 'platform', 'timestamp', 'text', 'source_url', 'author_handle', 'collection_basis', 'has_media', 'media_urls', 'urls', 'thread_indicator', 'engagement']);
  requireValue(profile?.verification_status === 'VERIFIED', 'HCP is not in the verified ingestion cohort');
  requireValue(input.hcp_id === profile.hcp_id, 'Post HCP identity mismatch');
  requireValue(PLATFORMS.includes(input.platform), 'Unsupported platform');
  const account = profile.handles?.[input.platform];
  requireValue(account && account.handle === input.author_handle, 'Post author does not match the verified platform account');
  requireValue(['official_api', 'licensed_provider', 'authorised_manual', 'public_rss'].includes(input.collection_basis), 'A supported collection_basis is required');
  for (const key of ['has_media', 'thread_indicator']) requireValue(input[key] === undefined || typeof input[key] === 'boolean', `${key} must be boolean`);
  const lists = {};
  for (const key of ['urls', 'media_urls']) {
    const values = input[key] ?? [];
    requireValue(Array.isArray(values) && values.length <= 20, `${key} must be an array of at most 20`);
    lists[key] = values.map(url => sourceUrl(url, key));
  }
  const engagement = input.engagement ?? {};
  exactKeys(engagement, ['likes', 'reposts', 'replies', 'views']);
  const metrics = {};
  for (const key of ['likes', 'reposts', 'replies', 'views']) {
    const value = engagement[key] ?? null;
    requireValue(value === null || (Number.isSafeInteger(value) && value >= 0), `${key} must be a nonnegative integer or null`);
    metrics[key] = value;
  }
  return { post_id: text(input.post_id, 'post_id', 128), hcp_id: profile.hcp_id, platform: input.platform,
    timestamp: timestamp(input.timestamp, 'timestamp', now), text: text(input.text, 'text', 30000),
    source_url: sourceUrl(input.source_url, 'source_url'), author_handle: input.author_handle,
    collection_basis: input.collection_basis, has_media: input.has_media ?? false, ...lists,
    thread_indicator: input.thread_indicator ?? false, engagement: metrics };
}

const string = { type: 'string' };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const EXTRACTION_SCHEMA = object({
  in_scope: { type: 'boolean' },
  extracted_archetype: { type: ['string', 'null'], enum: [...ARCHETYPES, null] },
  specialty_angle: string,
  entities: { type: 'array', items: object({ name: string, category: { type: 'string', enum: ['Molecule', 'Brand', 'Class', 'Trial_Name', 'Endpoint', 'Condition'] } }) },
  clinical_sentiment: { type: 'string', enum: ['Strongly_Favorable', 'Cautiously_Optimistic', 'Skeptical_Critical', 'Neutral'] },
  primary_clinical_critique: string,
  practice_friction_type: { type: 'string', enum: ['Prior_Auth', 'Tolerability_GI', 'Compounding', 'Affordability', 'None'] },
  pv_criteria_validation: object(Object.fromEntries(PV_CRITERIA.map(key => [key, { type: 'boolean' }]))),
  pv_evidence: object(Object.fromEntries(PV_CRITERIA.map(key => [key, { type: ['string', 'null'] }]))),
  pv_audit_rationale: string
});

// Validator for the deliberately small JSON Schema subset used by the extraction contract.
export function validateSchema(value, schema, path = 'extraction') {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  requireValue([schema.type].flat().includes(type), `${path}: invalid type`);
  if (schema.enum) requireValue(schema.enum.includes(value), `${path}: invalid enum`);
  if (type === 'object') {
    exactKeys(value, Object.keys(schema.properties));
    for (const key of schema.required) { requireValue(Object.hasOwn(value, key), `${path}.${key} is required`); validateSchema(value[key], schema.properties[key], `${path}.${key}`); }
  }
  if (type === 'array') { requireValue(value.length <= 100, `${path}: too many items`); value.forEach((v, i) => validateSchema(v, schema.items, `${path}[${i}]`)); }
  if (type === 'string') requireValue(value.length <= 6000, `${path}: text too long`);
}

export function validateExtraction(value, post) {
  validateSchema(value, EXTRACTION_SCHEMA);
  requireValue(value.in_scope === (value.extracted_archetype !== null), 'Out-of-scope posts must have no behavioral archetype');
  for (const key of PV_CRITERIA) {
    if (!value.pv_criteria_validation[key]) continue;
    const quote = value.pv_evidence[key];
    const source = key === 'identifiable_reporter' ? `${post.author_handle}\n${post.text}` : post.text;
    requireValue(typeof quote === 'string' && quote.trim().length > 0 && source.includes(quote), `Missing source-grounded PV evidence for ${key}`);
  }
  const complete = PV_CRITERIA.every(key => value.pv_criteria_validation[key]);
  return { ...value, post_id: post.post_id, hcp_id: post.hcp_id, platform: post.platform,
    pv_adverse_event_suspected: complete,
    pv_review_required: complete || value.pv_criteria_validation.adverse_event,
    review_status: 'PENDING', assessment: 'Automated screening only; qualified human review required' };
}
