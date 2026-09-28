const RULES = [
  ['Cardiology', /\b(?:cardiologists?|interventional cardiologists?)\b/gi, /\b(?:cardiology|cardio|heart failure|FACC|FSCAI|ESC)\b/gi],
  ['Endocrinology', /\bendocrinologists?\b/gi, /\b(?:endocrinology|metabolism|thyroid|FACE|incretin|reproductive endocrinology)\b/gi],
  ['Diabetology', /\b(?:diabetologists?|diabetes specialists?)\b/gi, /\b(?:diabetology|diabetes|diabetic|CDE|RSSDI)\b/gi],
  ['Gynecology_Obstetrics', /\b(?:gyn(?:ae|e)cologists?|obstetricians?|ob[ -]?gyn)\b/gi, /\b(?:gyn(?:ae|e)cology|obstetrics?|PCOS|FACOG|FOGSI)\b/gi],
  ['General_Medicine', /\b(?:internal medicine|general medicine|MD medicine|general physicians?)\b/gi, /\bphysicians?\b/gi],
  ['General_Practice', /\b(?:general practitioners?|family physicians?|family medicine|primary care physicians?)\b/gi, /\b(?:primary care|GP)\b/gi]
];

const matches = (value, pattern) => [...value.matchAll(pattern)].map(m => m[0]);

export function screenProfile({ name = '', bio = '' } = {}, now = new Date()) {
  const combined = `${name}\n${bio}`;
  const specialtySignals = RULES.flatMap(([specialty, roles, topics]) => {
    const roleTerms = matches(bio, roles), topicTerms = matches(bio, topics);
    return roleTerms.length || topicTerms.length ? [{ specialty, basis: roleTerms.length ? 'SELF_DESCRIBED_ROLE' : 'TOPIC_OR_AFFILIATION', matched_terms: [...new Set([...roleTerms, ...topicTerms])] }] : [];
  });
  const credentials = matches(combined, /\b(?:MBBS|DNB|FACC|FACOG|FRCP|MRCP|FRCS|FSCAI)\b/gi);
  // DO/MD/DM/PhD and generic consultant titles alone do not establish clinical practice.
  const ambiguous = matches(combined, /\b(?:MD|DM|DO|PhD)\b/g).concat(matches(bio, /\bconsultant\b/gi));
  const roles = specialtySignals.filter(s => s.basis === 'SELF_DESCRIBED_ROLE');
  const otherRole = /\b(?:surgeons?|hepatologists?)\b/i.test(bio);
  const classification = roles.length || credentials.length || otherRole ? 'CLINICAL_SIGNAL' : ambiguous.length || specialtySignals.length ? 'AMBIGUOUS' : 'NO_SIGNAL';
  const yearClues = [];
  const yearPattern = /\b(MBBS|MD|DM|DO|DNB|graduated|graduation|registered|registration)\s*(?:in\s+|year\s*[:=-]?\s*|[:=-]\s*)?(\d{4})\b/gi;
  for (const match of bio.matchAll(yearPattern)) {
    const year = Number(match[2]);
    if (year < 1900 || year > now.getUTCFullYear()) continue;
    yearClues.push({ year, kind: /^regist/i.test(match[1]) ? 'REGISTRATION_CLAIM' : 'QUALIFICATION_CLAIM', evidence: match[0], verified: false });
  }
  return {
    screening_version: 'bio-2', classification,
    matched_terms: [...new Set([...credentials, ...ambiguous, ...specialtySignals.flatMap(s => s.matched_terms)])],
    specialty_signals: specialtySignals,
    suggested_specialty: roles.length === 1 ? roles[0].specialty : null,
    primary_specialty: null,
    credential_signals: [...new Set(credentials)], ambiguous_credential_signals: [...new Set(ambiguous)],
    year_clues: yearClues, medical_registration_year: null, registration_year_verified: false,
    years_of_experience: null, experience_tier: 'Unassigned_Pending_Registry',
    identity_status: 'UNVERIFIED', india_practice_status: 'UNVERIFIED'
  };
}
