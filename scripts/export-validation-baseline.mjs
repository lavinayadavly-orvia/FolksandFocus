import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {researchProfiles,cohortPublications,articleDiscovery,socialAccounts} from '../data.mjs';
import {confirmedCohort} from '../generated/confirmed-cohort.mjs';
import {applyCohortIdentityReviews} from '../cohort-review.mjs';
import {locateDoctor} from '../geography.mjs';
import {reconcilePublicationField,reconcileMedicalReviews,reconcileAccounts,applyManualFieldReviews,applySupplementaryReviews,buildLaterQueue,compareLaterPriority} from '../research-validation.mjs';

const output = resolve(process.argv[2] || '../doctor-reconciliation-private');
const publicRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
if (output === publicRoot || output.startsWith(publicRoot + '/')) throw Error('Research artifacts must stay outside the served repository');
await mkdir(output, {recursive:true, mode:0o700});
const cohort = applyCohortIdentityReviews(confirmedCohort);
const raw = new Map(cohort.doctors.map(p=>[p.cohort_id,p]));
const reviewed = JSON.parse(await readFile(new URL('../reviewed-triage-scans.json',import.meta.url),'utf8'));
let manual={reviews:[]};
try{manual=JSON.parse(await readFile(resolve(output,'manual-field-reviews.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
let supplementary={reviews:[],deferredClaims:[]};
try{supplementary=JSON.parse(await readFile(resolve(output,'supplementary-field-reviews.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const capture = e=>({url:e.profile_url,discoveryUrl:e.source_url,checkedAt:e.checked_at,locator:e.source_locator});
const field = (value, sources, status='SOURCE_SUPPORTED')=>({value, status:value == null || (Array.isArray(value)&&!value.length)?'UNRESOLVED':sources.length?status:'PROVENANCE_REVIEW',sources});
const knownLocation=value=>/unresolved|not verified|unknown/i.test(value||'')?null:value;
const records=researchProfiles.map(p=>{
  const r=raw.get(p.id), sources=r.evidence.map(capture), location=locateDoctor(p);
  const geographySource=p.geographyEvidence ? [{url:p.geographyEvidence.sourceUrl,checkedAt:p.geographyEvidence.checkedAt,locator:p.geographyEvidence.locator}] : sources;
  const e=p.experience;
  const fields={
    name:field(p.name,sources),
    specialties:field(p.specialties,p.specialtyReview?[{url:p.specialtyReview.url,checkedAt:p.specialtyReview.checkedAt,locator:p.specialtyReview.basis}]:sources),
    qualifications:field(p.qualifications,r.evidence.filter(e=>e.qualifications).map(capture)),
    institutions:field(r.institutions,sources),
    city:field(knownLocation(location.city),geographySource,'NORMALIZED_FROM_SOURCE'),
    state:field(knownLocation(location.state),geographySource,'NORMALIZED_FROM_SOURCE'),
    experience:field(e||null,e?[{url:e.url||e.profileUrl,checkedAt:e.observedOn||e.checkedAt,locator:e.sourceLocator||e.basis}]:[],e?.status||'SOURCE_SUPPORTED'),
  };
  for(const name of ['publicAccounts','publications','authoredArticles','medicalReviews','conferenceParticipation','socialActivity']) fields[name]={value:null,status:'REVIEW_REQUIRED',sources:[],reason:'Existing discovery and attribution evidence requires field-level reconciliation; null is not absence.'};
  fields.publications=reconcilePublicationField(r,cohortPublications);
  fields.medicalReviews=reconcileMedicalReviews(r,articleDiscovery);
  fields.publicAccounts=reconcileAccounts(r,socialAccounts);
  const deferredSpecialty=p.specialties.some(s=>/^cardiac anaesthesiology$/i.test(s));
  const result=applySupplementaryReviews(applyManualFieldReviews({id:p.id,fields,identityStatus:p.identityStatus,registryVerified:p.registryVerified,archetype:p.tier,scope:deferredSpecialty?'DEFERRED_SPECIALTY':'PRIORITY',scan:reviewed[p.id]||{status:'NOT_STARTED'},evidenceInventory:{sourceDiscovery:p.sourceDiscovery||null,articleDiscovery:p.articleDiscovery||null,publicationSearch:p.publicationSearch||null,footprints:p.footprints},rawSourceRecord:r},manual.reviews,manual.reviewDate),supplementary.reviews);
  result.deferredClaims=supplementary.deferredClaims.filter(c=>c.hcpId===p.id);
  for(const review of result.manualReviews||[])for(const deferred of review.deferred||[]){
    const f=result.fields[deferred.parameter];
    if(f&&['UNRESOLVED','REVIEW_REQUIRED'].includes(f.status)){f.reason=deferred.reason;f.nextAction=deferred.nextAction;}
  }
  result.pending=buildLaterQueue(result);
  return result;
});
if(new Set(records.map(r=>r.id)).size!==cohort.doctors.length)throw Error('Cohort identity count mismatch');
const completeness={};
for(const r of records)for(const [key,f] of Object.entries(r.fields)){
  completeness[key]??={};completeness[key][f.status]=(completeness[key][f.status]||0)+1;
  if(f.status==='SOURCE_SUPPORTED'&&f.sources.some(s=>!s.url||!s.checkedAt))throw Error(`Missing provenance ${r.id}/${key}`);
}
const generatedAt=new Date().toISOString();
const summary={generatedAt,cohortRecords:records.length,quarantinedRecords:cohort.identityReview.length,uploadedCsvMerged:false,uniqueCombinedDoctorCount:null,fieldCompleteness:completeness,initialScans:records.reduce((a,r)=>(a[r.scan.status]=(a[r.scan.status]||0)+1,a),{}),limitations:['Evidence inventory is not a completed clinician review.','Existing source confirmation is not medical council verification.','Uploaded database identity reconciliation remains pending.','Archetype is retained for traceability, not evidence of influence.']};
for(const [name,data] of Object.entries({'cohort-validation-baseline.json':{generatedAt,records,quarantined:cohort.identityReview},'field-completeness.json':summary,'residual-later-queue.json':{generatedAt,items:records.map(r=>({id:r.id,name:r.fields.name.value,scope:r.scope,initialScan:r.scan.status,missingParameters:r.pending})).sort(compareLaterPriority)}}))await writeFile(resolve(output,name),JSON.stringify(data,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(summary,null,2));
