import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyExperience} from '../reported-experience.mjs';
import {EXPERIENCE_TIERS} from '../experience.mjs';
import {experienceExclusions} from '../experience-reviews.mjs';
const directory=resolve(process.argv[2]||'../doctor-reconciliation-private');
const repository=fileURLToPath(new URL('..',import.meta.url));
if(directory===repository.replace(/\/$/,'')||directory.startsWith(repository))throw Error('Private output required');
const read=async name=>JSON.parse(await readFile(resolve(directory,name)));
const cohort=await read('cohort-validation-baseline.json');
const division=await read('specialty-division.json');
const byId=new Map(cohort.records.map(r=>[r.id,r]));
const upload=await read('priority-workbook-import.json');
const decisions=await read('reviewed-priority-links.json');
if(decisions.sourceSha256!==upload.summary.sourceSha256)throw Error('Identity decisions belong to a different upload');
const uploadedById=new Map(upload.records.map(r=>[r.sourceId,r]));
const links=new Map();
for(const link of decisions.links){
  const person=byId.get(link.cohortId), supplied=uploadedById.get(link.sourceId);
  if(!person||!supplied||links.has(link.sourceId)||link.status!=='SAME_PERSON_CORROBORATED'||link.matchedSignals.length<3||!link.checkedAt||!person.rawSourceRecord.profile_urls.includes(link.sourceUrl)||!supplied.identityMatch.nameCandidates.includes(link.cohortId))throw Error('Invalid reviewed identity link');
  links.set(link.sourceId,link);
}
const records=division.records.map(row=>{
  const link=row.source==='UPLOADED_PRIORITY_SHEET'?links.get(row.id):null;
  const existing=row.source==='EXISTING_COHORT'?byId.get(row.id):link?byId.get(link.cohortId):null;
  const field=existing?.fields.experience;
  const source=field?.sources?.[0];
  const experience=field?.value?{...field.value,url:field.value.url||source?.url,observedOn:field.value.observedOn||source?.checkedAt}:null;
  const roleReview=existing&&experienceExclusions.find(e=>existing.rawSourceRecord.profile_urls.includes(e.url));
  const classification=field?.status==='CONFLICT_REVIEW'?null:classifyExperience({experience,roleReview});
  const reason=classification?null:roleReview?'Physician role requires review':field?.status==='CONFLICT_REVIEW'?'Competing experience claims require resolution':existing?'No usable experience evidence in existing record':'Uploaded row has no structured experience; identity linkage and source review required';
  return {...row,canonicalId:existing?.id||`UPLOAD-${row.id}`,identityLink:link||null,profile:classification?.label||null,profileStatus:classification?.status||'ASSIGNMENT_PENDING',experienceSources:field?.sources||[],experienceYears:classification?.years??null,assignmentReason:reason,nextProfileAction:classification?null:'Check existing hospital biography for explicit experience; retain record pending assignment'};
});
const summary={generatedAt:new Date().toISOString(),rules:EXPERIENCE_TIERS,uniqueCombinedDoctorCount:null,confirmedCrossSourceLinks:links.size,provisionalIdentityRecords:new Set(records.map(r=>r.canonicalId)).size,sources:{}};
for(const source of ['EXISTING_COHORT','UPLOADED_PRIORITY_SHEET']){
  const rows=records.filter(r=>r.source===source);
  const profiles=Object.fromEntries(EXPERIENCE_TIERS.map(t=>[t.label,rows.filter(r=>r.profile===t.label).length]));
  const pending=rows.filter(r=>!r.profile).length;
  if(Object.values(profiles).reduce((a,b)=>a+b,0)+pending!==rows.length)throw Error('Profile counts do not reconcile');
  summary.sources[source]={records:rows.length,profiles,pending};
}
await writeFile(resolve(directory,'specialty-profile-division.json'),JSON.stringify({summary,records},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(summary,null,2));
