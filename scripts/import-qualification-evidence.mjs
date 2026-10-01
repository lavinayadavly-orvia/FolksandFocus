import fs from 'node:fs';
import {confirmedCohort} from '../generated/confirmed-cohort.mjs';
import {mbbsCompletionYear} from '../qualification-experience.mjs';
import {collectedQualificationEvidence} from '../generated/qualification-evidence.mjs';

const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const accepted = [], review = [];
for (const row of input.evidence || []) {
  const doctor = confirmedCohort.doctors.find(d => d.cohort_id === row.hcpId);
  const page = input.pages.find(p => p.url === row.profile_url);
  const valid = doctor?.name === row.nameAsReported && doctor.profile_urls.includes(row.profile_url)
    && page?.status === 'PAGE_CHECKED' && page.sha256 === row.sourceHash
    && /^[a-f0-9]{64}$/.test(row.sourceHash || '')
    && page.checkedAt === row.checked_at && page.qualificationRecords.includes(row.qualifications)
    && Number.isFinite(Date.parse(row.checked_at)) && row.identityBasis && row.sourceLocator
    && mbbsCompletionYear(row.qualifications) !== null;
  if (valid) accepted.push(row);
  else review.push({hcpId: row.hcpId, url: row.profile_url, reason: 'IDENTITY_OR_QUALIFICATION_REQUIRES_REVIEW'});
}
const merged = new Map(collectedQualificationEvidence.map(r => [r.hcpId+'|'+r.profile_url+'|'+r.qualifications,r]));
for (const row of accepted) merged.set(row.hcpId+'|'+row.profile_url+'|'+row.qualifications,row);
const auditPath = new URL('../generated/qualification-scan-audit.json',import.meta.url);
let previousAudit = {pages:[]};
try { previousAudit = JSON.parse(fs.readFileSync(auditPath,'utf8')); }
catch(error) { if(error.code !== 'ENOENT')throw error; }
const pageAudit = new Map(previousAudit.pages.map(p=>[p.url,p]));
for(const page of input.pages || []) {
  const matched = confirmedCohort.doctors.filter(d=>d.profile_urls.includes(page.url));
  if(matched.length!==1)continue;
  const claims = accepted.filter(r=>r.profile_url===page.url);
  pageAudit.set(page.url,{hcpId:matched[0].cohort_id,name:matched[0].name,url:page.url,
    checkedAt:page.checkedAt,status:page.status,sourceHash:page.sha256||null,
    acceptedQualificationClaims:claims.length,completionYears:[...new Set(claims.map(r=>mbbsCompletionYear(r.qualifications)))],
    parameter:'MBBS_COMPLETION_YEAR',bucket:claims.length?'FOUND':'LATER',
    reason:claims.length?'Explicit dated qualification retained; hospital experience takes precedence.'
      :page.qualificationReview|| (page.status==='PAGE_CHECKED'?'NO_UNAMBIGUOUS_MBBS_COMPLETION_YEAR':page.status),
    nextSource:claims.length?null:'Institutional CV, university qualification record or council entry matched by identity.',
    scope:'Automated hospital qualification pass, not a completed manual identity or social-account search.'});
}
fs.writeFileSync(new URL('../generated/qualification-evidence.mjs',import.meta.url),
  `export const collectedQualificationEvidence = ${JSON.stringify([...merged.values()],null,2)};\n`);
fs.writeFileSync(auditPath,JSON.stringify({updatedAt:new Date().toISOString(),pages:[...pageAudit.values()]},null,2)+'\n');
console.log(JSON.stringify({accepted:accepted.length, total:merged.size, review},null,2));
