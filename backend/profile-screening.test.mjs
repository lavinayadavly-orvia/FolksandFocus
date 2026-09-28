import test from 'node:test';
import assert from 'node:assert/strict';
import { screenProfile } from './profile-screening.mjs';

const now = new Date('2026-09-28T00:00:00Z');
test('specialty roles do not depend on taxonomy order or topic mentions', () => {
  const result = screenProfile({ bio: 'Diabetologist, thyroid and PCOS interests. MBBS' }, now);
  assert.equal(result.suggested_specialty, 'Diabetology');
  assert.equal(result.primary_specialty, null);
  assert.equal(result.specialty_signals.length, 3);
  assert.equal(screenProfile({ bio: 'Endocrinologist and cardiologist' }).suggested_specialty, null);
});
test('credentials and topics are not automatically specialties or verified identity', () => {
  assert.equal(screenProfile({ bio: 'MBBS' }).suggested_specialty, null);
  assert.equal(screenProfile({ bio: 'Internal medicine' }).suggested_specialty, 'General_Medicine');
  assert.equal(screenProfile({ bio: 'General practitioner' }).suggested_specialty, 'General_Practice');
  assert.equal(screenProfile({ bio: 'PCOS advocate, diabetes, RSSDI' }).classification, 'AMBIGUOUS');
  assert.equal(screenProfile({ bio: 'I do marketing and admin' }).classification, 'NO_SIGNAL');
  assert.equal(screenProfile({ name: 'Example MBBS', bio: '' }).classification, 'CLINICAL_SIGNAL');
});
test('qualification and registration clues never produce verified experience or sentinel dates', () => {
  const result = screenProfile({ bio: 'Congress 2001. MBBS 1985, MD 1999. Registered in 2003.' }, now);
  assert.deepEqual(result.year_clues.map(c => c.year), [1985, 1999, 2003]);
  assert.equal(result.year_clues[2].kind, 'REGISTRATION_CLAIM');
  assert.equal(result.medical_registration_year, null);
  assert.equal(result.registration_year_verified, false);
  assert.equal(result.experience_tier, 'Unassigned_Pending_Registry');
  assert.equal(screenProfile({ bio: 'MBBS' }, now).medical_registration_year, null);
});
test('year validation is dynamic and ignores unrelated or future years', () => {
  assert.deepEqual(screenProfile({ bio: 'Award 2020, MBBS 2027, registered 2026' }, now).year_clues.map(c => c.year), [2026]);
  assert.deepEqual(screenProfile({ bio: 'MBBS 2027' }, new Date('2028-01-01')).year_clues.map(c => c.year), [2027]);
});
test('provided simulation never becomes verified Indian clinician data', () => {
  const bios = ['Surgeon, Liver Transplantation. MBBS 1985 AIIMS, FRCS.', 'Endocrinologist. T2DM, Obesity, PCOS. MD 1999.', 'Helping you lose weight with diet and biohacking!', 'Bariatric & Metabolic Surgeon. MBBS 1977.'];
  const results = bios.map(bio => screenProfile({ bio }, now));
  assert.equal(results.filter(r => r.classification === 'CLINICAL_SIGNAL').length, 3);
  assert.ok(results.every(r => r.identity_status === 'UNVERIFIED' && r.india_practice_status === 'UNVERIFIED' && r.years_of_experience === null));
});
