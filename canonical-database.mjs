const fieldNames = ['name', 'specialties', 'qualifications', 'institutions', 'city', 'state', 'experience', 'publicAccounts', 'publications', 'authoredArticles', 'medicalReviews', 'conferenceParticipation', 'socialActivity'];

function uniqueIndex(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!id || result.has(id)) throw Error('Missing or duplicate source ID');
    result.set(id, row);
  }
  return result;
}

export function buildCanonicalDatabase({cohort, upload, division, decisions, followups}, now = new Date()) {
  if (decisions.sourceSha256 !== upload.summary.sourceSha256) throw Error('Upload fingerprint mismatch');
  const existing = uniqueIndex(cohort.records, r => r.id);
  const supplied = uniqueIndex(upload.records, r => r.sourceId);
  const classified = uniqueIndex(division.records, r => `${r.source}:${r.id}`);
  if (classified.size !== existing.size + supplied.size) throw Error('Classification coverage mismatch');
  const links = uniqueIndex(decisions.links, r => r.sourceId);
  for (const link of links.values()) {
    const doctor = existing.get(link.cohortId), row = supplied.get(link.sourceId);
    if (!doctor || !row || link.status !== 'SAME_PERSON_CORROBORATED' ||
        !link.checkedAt || (link.matchedSignals?.length || 0) < 3 ||
        !doctor.rawSourceRecord.profile_urls.includes(link.sourceUrl) ||
        !row.identityMatch.nameCandidates.includes(link.cohortId)) throw Error('Unsupported identity link');
  }
  const records = new Map();
  for (const doctor of existing.values()) {
    const classification = classified.get(`EXISTING_COHORT:${doctor.id}`);
    if (!classification || classification.canonicalId !== doctor.id) throw Error('Stale existing classification');
    records.set(doctor.id, {
      ...structuredClone(doctor),
      classification: structuredClone(classification),
      sourceRows: [{source: 'EXISTING_COHORT', id: doctor.id}],
      uploadedClaims: [], identityLinks: [],
    });
  }
  const duplicateReport = [], later = [];
  for (const row of supplied.values()) {
    const classification = classified.get(`UPLOADED_PRIORITY_SHEET:${row.sourceId}`);
    const link = links.get(row.sourceId);
    const id = link?.cohortId || `UPLOAD-${row.sourceId}`;
    if (!classification || classification.canonicalId !== id) throw Error('Stale uploaded classification');
    const reviews = (followups?.records || []).filter(r => r.sourceId === row.sourceId);
    const claim = {...structuredClone(row), sourceSha256: upload.summary.sourceSha256};
    if (link) {
      const doctor = records.get(id);
      doctor.sourceRows.push({source: 'UPLOADED_PRIORITY_SHEET', id: row.sourceId, sheet: row.sheet, row: row.row});
      doctor.uploadedClaims.push(claim);
      doctor.identityLinks.push(structuredClone(link));
      if (classification.primaryCategory !== doctor.classification.primaryCategory) {
        later.push({id, sourceId: row.sourceId, parameter: 'primarySpecialty', reason: 'Source-supported and uploaded primary specialty classifications differ', nextAction: 'Review both specialty claims and select one primary category; retain secondary specialties'});
      }
      if (link.retainedDifference) later.push({id, sourceId: row.sourceId, parameter: 'uploadedClaimReview', reason: link.retainedDifference, nextAction: 'Resolve remaining supplied claims individually without reopening the supported identity link'});
    } else {
      records.set(id, {
        id, identityStatus: 'UPLOAD_IDENTITY_REVIEW_REQUIRED', registryVerified: false,
        fields: Object.fromEntries(fieldNames.map(field => [field, {
          value: null, status: 'NOT_INDEPENDENTLY_VALIDATED', sources: [],
          reason: 'Uploaded claim requires source review',
          nextAction: `Validate ${field} from the existing supplied leads or an identity-matched public professional source`,
        }])),
        classification: {...structuredClone(classification), status: 'CLASSIFIED_FROM_SUPPLIED_CLAIMS'},
        scan: {status: 'NOT_STARTED'}, sourceRows: [{source: 'UPLOADED_PRIORITY_SHEET', id: row.sourceId, sheet: row.sheet, row: row.row}],
        uploadedClaims: [claim], identityLinks: [], pending: [],
      });
      later.push({id, sourceId: row.sourceId, parameter: 'identity', reason: row.identityMatch.nameCandidates.length ? 'Potential cross-source overlap remains unresolved' : 'No exact-name candidate; spelling variants and within-upload overlaps still require review', nextAction: 'Compare qualification institutions, location and affiliation before establishing a distinct identity'});
    }
    duplicateReport.push({sourceId: row.sourceId, canonicalId: id,
      status: link ? 'CONFIRMED_LINK' : 'REVIEW_REQUIRED',
      candidates: row.identityMatch.nameCandidates, decision: link || null, reviews,
      nextAction: link ? null : reviews[0]?.nextAction || row.nextAction});
  }
  for (const record of records.values()) {
    for (const pending of record.pending || []) later.push({id: record.id, ...pending});
    if (record.identityStatus === 'UPLOAD_IDENTITY_REVIEW_REQUIRED') {
      for (const [parameter, field] of Object.entries(record.fields)) later.push({id: record.id, parameter, reason: field.reason, nextAction: field.nextAction});
    }
    if (!record.classification.profile) later.push({id: record.id, parameter: 'experienceProfile', reason: record.classification.assignmentReason, nextAction: record.classification.nextProfileAction});
  }
  for (const review of followups?.records || []) {
    if (!supplied.has(review.sourceId)) throw Error('Orphan identity follow-up');
    if (!links.has(review.sourceId)) later.push({id: `UPLOAD-${review.sourceId}`, parameter: 'identity', reason: review.finding, nextAction: review.nextAction, evidence: review});
  }
  const rows = [...records.values()];
  const sourceRows = rows.reduce((n, r) => n + r.sourceRows.length, 0);
  if (sourceRows !== existing.size + supplied.size || rows.length !== sourceRows - links.size) throw Error('Source accounting mismatch');
  if (later.some(r => !r.reason || !r.nextAction)) throw Error('Unexplained pending work');
  const fieldCompleteness = {};
  for (const name of fieldNames) {
    fieldCompleteness[name] = {};
    for (const r of rows) {
      const status = r.fields[name]?.status || 'UNRESOLVED';
      fieldCompleteness[name][status] = (fieldCompleteness[name][status] || 0) + 1;
    }
  }
  const summary = {generatedAt: now.toISOString(), status: 'WORKING_DATABASE_NOT_FINAL',
    existingRecords: existing.size, uploadedRows: supplied.size, sourceRows,
    confirmedCrossSourceLinks: links.size, provisionalIdentityRecords: rows.length,
    uniqueDoctorCount: null, uploadedIdentityReviewsPending: supplied.size - links.size,
    assignedProfiles: rows.filter(r => r.classification.profile).length,
    profileAssignmentsPending: rows.filter(r => !r.classification.profile).length,
    quarantinedSourceRecords: cohort.quarantined?.length || 0,
    limitations: ['A provisional identity record is not a certified unique doctor.', 'Uploaded claims are not promoted to validated fields by classification.', 'Existing source support is not proof that all enrichment work is complete.']};
  return {summary, records: rows, quarantined: cohort.quarantined || [], duplicateReport, fieldCompleteness, later};
}
