import { readFile, writeFile } from 'node:fs/promises';
import { researchProfiles } from '../data.mjs';
import { researchPhase } from '../research-phase.mjs';

const path = new URL('../generated/research-triage.json', import.meta.url);
let previous = { items: [] };
try { previous = JSON.parse(await readFile(path, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const saved = new Map(previous.items.map(item => [item.hcpId, item.scan]));
let qualificationAudit = {pages:[]};
try { qualificationAudit = JSON.parse(await readFile(new URL('../generated/qualification-scan-audit.json',import.meta.url),'utf8')); }
catch(error) { if(error.code !== 'ENOENT')throw error; }
const reviewedScans = JSON.parse(await readFile(new URL('../reviewed-triage-scans.json', import.meta.url), 'utf8'));
const publicSourceLeads = JSON.parse(await readFile(new URL('../reviewed-public-source-leads.json', import.meta.url), 'utf8'));
const experienceLeads = new Map();
for (const lead of publicSourceLeads.leads || []) {
  if (lead.type !== 'EXPERIENCE' || lead.bucket !== 'LATER' || !lead.hcpId) continue;
  if (!researchProfiles.some(profile => profile.id === lead.hcpId)) throw new Error(`Unknown experience lead: ${lead.hcpId}`);
  const entries = experienceLeads.get(lead.hcpId) || [];
  entries.push(lead);
  experienceLeads.set(lead.hcpId, entries);
}
for (const [id, scan] of Object.entries(reviewedScans)) {
  const elapsed = Date.parse(scan.finishedAt) - Date.parse(scan.startedAt);
  if (!researchProfiles.some(profile => profile.id === id) || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 300000) {
    throw new Error(`Invalid timed scan: ${id}`);
  }
  saved.set(id, scan);
}
const present = value => typeof value === 'string' && value.trim() && !/^(not verified|unknown|unassigned)$/i.test(value.trim());
const items = researchProfiles.map(profile => {
  const institutions = profile.footprints.filter(item => item.type === 'INSTITUTION');
  const available = {
    affiliation: institutions.length > 0 && !!present(profile.affiliation),
    location: !!present(profile.city),
    specialty: !!present(profile.specialty),
    qualifications: (profile.qualifications || []).some(present),
    experience: !!profile.experience,
    // Discovery candidates alone are not verified accounts or attributed statements.
    publicAccounts: null,
    attributedContent: null,
  };
  const recordedScan = saved.get(profile.id) || { status: 'NOT_STARTED', startedAt: null, finishedAt: null, deferred: [] };
  const scan = {...recordedScan, deferred: recordedScan.deferred.filter(field => available[field.parameter] !== true && !(field.parameter === 'specialty' && profile.specialtyReview))};
  const qualificationPass = qualificationAudit.pages.filter(page=>page.hcpId===profile.id);
  // Parameter-only checks do not imply a completed timed, whole-profile scan.
  const deferredExperienceSources = available.experience ? [] : experienceLeads.get(profile.id) || [];
  const parameterBuckets = Object.fromEntries(Object.keys(available).map(parameter=>[parameter,
    available[parameter]===true?'FOUND':scan.deferred.some(field=>field.parameter===parameter)
      ||(parameter==='experience'&&(qualificationPass.length || deferredExperienceSources.length))?'LATER':'NOW']));
  const missingFields = Object.keys(available).filter(key => available[key] === false);
  const needsLedgerReview = Object.keys(available).filter(key => available[key] === null);
  const deferredBySpecialty = [profile.specialty, ...(profile.specialties || [])]
    .some(value => /^cardiac anaesthesiology$/i.test(value || ''));
  const deferredByPhase = researchPhase.deferUnclassified && profile.tier === 'Awaiting classification';
  if (deferredByPhase) {
    for (const parameter of Object.keys(parameterBuckets)) {
      if (parameterBuckets[parameter] !== 'FOUND') parameterBuckets[parameter] = 'LATER';
    }
  }
  return {
    hcpId: profile.id, name: profile.name, hospital: profile.affiliation,
    hospitalUrls: [...new Set(institutions.map(item => item.url).filter(Boolean))],
    evidenceAvailable: available, missingFields, needsLedgerReview, scan, qualificationPass, deferredExperienceSources, parameterBuckets,
    bucket: deferredBySpecialty || deferredByPhase ? 'LATER' : scan.status === 'COMPLETE' ? (scan.deferred.length ? 'LATER' : 'DONE') : 'NOW',
    deferredByPhase,
    deferralReason: deferredBySpecialty ? 'User deferred Cardiac Anaesthesiology; prioritize Diabetology, Cardiology, Endocrinology, Gynaecology, CP and GP.' : deferredByPhase ? researchPhase.reason : null,
    laterPriority: deferredBySpecialty ? 3 : scan.deferred.length > 0 && scan.deferred.length <= 2 ? 1 : 2,
  };
});
items.sort((a, b) => {
  const order = { NOW: 0, LATER: 1, DONE: 2 };
  return order[a.bucket] - order[b.bucket] ||
    (a.bucket === 'LATER' ? a.laterPriority - b.laterPriority || a.missingFields.length - b.missingFields.length : 0) ||
    a.name.localeCompare(b.name) || a.hcpId.localeCompare(b.hcpId);
});
const counts = { NOW: 0, LATER: 0, DONE: 0 };
for (const item of items) counts[item.bucket]++;
await writeFile(path, JSON.stringify({ generatedAt: new Date().toISOString(), maxScanSeconds: 300,
  researchPhase,
  note: 'Evidence inventory is not a completed timed scan. Public account and content fields require listening-ledger review.',
  qualificationPassDoctors:items.filter(item=>item.qualificationPass.length).length,
  experienceDeferred:items.filter(item=>item.parameterBuckets.experience==='LATER').length,
  counts, items }, null, 2) + '\n');
console.log(JSON.stringify({ total: items.length, ...counts }));
