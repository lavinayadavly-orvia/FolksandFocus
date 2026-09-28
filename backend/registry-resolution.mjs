// A name similarity score proposes review candidates; it never certifies identity.
export function nameTokens(name) {
  return String(name || '').normalize('NFKC').toLowerCase()
    .replace(/\b(?:dr|doctor|prof|professor)\.?\s*/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).sort();
}
const registration = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
const council = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function registrationYear(date, now = new Date()) {
  const parts = String(date || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!parts) return null;
  const [, day, month, year] = parts.map(Number), parsed = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || parsed > now || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return year;
}

export function assessRegistryCandidate(input, record, now = new Date()) {
  const a = nameTokens(input.name), b = nameTokens(record.name);
  const exactName = a.length > 0 && a.join(' ') === b.join(' ');
  const overlap = new Set(a.filter(token => b.includes(token))).size;
  const union = new Set([...a, ...b]).size;
  const exactRegistration = Boolean(input.registration_number) && registration(input.registration_number) === registration(record.registration_no);
  const exactCouncil = Boolean(input.state_medical_council) && council(input.state_medical_council) === council(record.state_medical_council);
  const flags = [];
  if (input.registration_number && !exactRegistration) flags.push('REGISTRATION_NUMBER_CONFLICT');
  if (input.state_medical_council && !exactCouncil) flags.push('COUNCIL_CONFLICT');
  if (!exactName) flags.push('NAME_REVIEW_REQUIRED');
  const year = registrationYear(record.registration_date, now);
  if (year === null) flags.push('REGISTRATION_DATE_INVALID_OR_MISSING');
  const qualificationYear = Number(record.qualification_year);
  if (year && qualificationYear > 1900 && year - qualificationYear > 2) flags.push('POSSIBLE_LATER_COUNCIL_REGISTRATION');
  flags.push('FIRST_MEDICAL_REGISTRATION_UNCONFIRMED');
  return {
    registered_name: record.name, registration_number: record.registration_no,
    state_medical_council: record.state_medical_council, council_registration_year: year,
    name_similarity: union ? overlap / union : 0,
    identity_status: exactName && exactRegistration && exactCouncil ? 'REGISTRY_FIELDS_MATCHED' : 'REVIEW',
    years_since_this_council_registration: year ? now.getUTCFullYear() - year : null,
    years_of_experience: null, axis_1_tier: null, flags,
    source_url: record.source_url || null
  };
}
