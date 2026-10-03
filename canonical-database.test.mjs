import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCanonicalDatabase} from './canonical-database.mjs';

function fixture(linked = false) {
  const sourceUrl = 'https://example.org/doctor';
  return {
    cohort: {records: [{id: 'a', fields: {name: {value: 'Example Doctor', status: 'SOURCE_SUPPORTED', sources: [{url: sourceUrl}]}}, rawSourceRecord: {profile_urls: [sourceUrl]}, pending: [], scan: {status: 'NOT_STARTED'}}], quarantined: [{id: 'placeholder'}]},
    upload: {summary: {sourceSha256: 'digest'}, records: [{sourceId: 'b', supplied: {'Full Name': 'Example Doctor', Qualification: 'MD'}, sheet: 'Priority', row: 2, identityMatch: {nameCandidates: ['a']}, nextAction: 'Check institutional evidence'}]},
    decisions: {sourceSha256: 'digest', links: linked ? [{sourceId: 'b', cohortId: 'a', status: 'SAME_PERSON_CORROBORATED', sourceUrl, checkedAt: '2026-10-03', matchedSignals: ['name', 'qualification', 'city']}] : []},
    division: {records: [
      {source: 'EXISTING_COHORT', id: 'a', canonicalId: 'a', profile: 'Trailblazers', primaryCategory: 'Cardiology'},
      {source: 'UPLOADED_PRIORITY_SHEET', id: 'b', canonicalId: linked ? 'a' : 'UPLOAD-b', profile: linked ? 'Trailblazers' : null, primaryCategory: 'Cardiology', assignmentReason: 'No reviewed experience', nextProfileAction: 'Read hospital biography'},
    ]}, followups: {records: []},
  };
}

test('unreviewed identical names remain separate and supplied fields are not promoted', () => {
  const data = buildCanonicalDatabase(fixture());
  assert.equal(data.summary.provisionalIdentityRecords, 2);
  assert.equal(data.summary.uniqueDoctorCount, null);
  assert.equal(data.records[1].fields.qualifications.value, null);
  assert.equal(data.records[1].uploadedClaims[0].supplied.Qualification, 'MD');
  assert.equal(data.duplicateReport[0].status, 'REVIEW_REQUIRED');
  assert.ok(data.later.every(task => task.reason && task.nextAction));
});
test('reviewed overlap counts one identity and profile while retaining both source rows', () => {
  const data = buildCanonicalDatabase(fixture(true));
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].sourceRows.length, 2);
  assert.equal(data.summary.assignedProfiles, 1);
  assert.equal(data.quarantined.length, 1);
  assert.equal(data.summary.uniqueDoctorCount, null);
});
test('stale classification, duplicate IDs and unsupported merges fail', () => {
  const stale = fixture(true); stale.division.records[1].canonicalId = 'UPLOAD-b';
  assert.throws(() => buildCanonicalDatabase(stale), /Stale/);
  const duplicate = fixture(); duplicate.upload.records.push(duplicate.upload.records[0]);
  assert.throws(() => buildCanonicalDatabase(duplicate), /duplicate/);
  const unsafe = fixture(true); unsafe.decisions.links[0].matchedSignals = ['name'];
  assert.throws(() => buildCanonicalDatabase(unsafe), /Unsupported/);
  const wrongUpload = fixture(); wrongUpload.decisions.sourceSha256 = 'other';
  assert.throws(() => buildCanonicalDatabase(wrongUpload), /fingerprint/);
});
test('specialty disagreements are queued without overwriting supported classification', () => {
  const input = fixture(true); input.division.records[1].primaryCategory = 'Diabetology';
  const data = buildCanonicalDatabase(input);
  assert.equal(data.records[0].classification.primaryCategory, 'Cardiology');
  assert.ok(data.later.some(t => t.parameter === 'primarySpecialty'));
});
