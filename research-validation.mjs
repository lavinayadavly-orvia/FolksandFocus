import {socialSourceKey} from './social-identity.mjs';

const nameKey=value=>String(value||'').toLowerCase().replace(/\(gp capt\)/g,'').replace(/\b(?:dr|prof|professor)\b\.?/g,'').replace(/[^a-z0-9]/g,'');
const urlKey=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.origin+u.pathname.replace(/\/$/,''):null;}catch{return null;}};
const provenance=source=>!!urlKey(source?.url)&&Number.isFinite(Date.parse(source?.checkedAt));
const source=(url,checkedAt,locator)=>({url,checkedAt,locator});

export function buildLaterQueue(record) {
  const tasks=[];
  const add=task=>{
    const value={...task,bucket:'LATER'};
    if(!tasks.some(t=>t.parameter===value.parameter&&t.reason===value.reason&&t.nextAction===value.nextAction))tasks.push(value);
  };
  for(const [parameter,f] of Object.entries(record.fields)){
    if(['UNRESOLVED','PROVENANCE_REVIEW','REVIEW_REQUIRED','CONFLICT_REVIEW','SEARCHED_NO_CONFIRMED_MATCH'].includes(f.status)||f.coverageComplete===false){
      add({parameter,reason:f.reason||'Missing or incomplete field-level evidence',nextAction:f.nextAction||(parameter==='experience'?'Read explicit hospital experience; retain conflicting claims':parameter==='city'||parameter==='state'?'Verify current practice location against official hospital profile':'Review exact clinician attribution and source evidence')});
    }
  }
  for(const review of record.manualReviews||[])for(const task of review.deferred||[])add(task);
  for(const task of record.supplementaryFollowUps||[])add(task);
  for(const claim of record.deferredClaims||[])add({parameter:claim.parameter,reason:claim.reason||claim.status,nextAction:claim.nextAction,sourceUrl:claim.url,checkedAt:claim.checkedAt,valueAsReported:claim.valueAsReported});
  if(tasks.some(t=>!t.parameter||!t.reason||!t.nextAction))throw Error(`Incomplete LATER task: ${record.id}`);
  return tasks;
}

export function compareLaterPriority(a,b) {
  return (a.scope==='DEFERRED_SPECIALTY')-(b.scope==='DEFERRED_SPECIALTY')||
    new Set(a.missingParameters.map(t=>t.parameter)).size-new Set(b.missingParameters.map(t=>t.parameter)).size||a.name.localeCompare(b.name);
}

export function reconcilePublicationField(person, collection) {
  const publications=new Map(collection.publications.map(p=>[p.id,p]));
  const accepted=[],held=[...collection.review.filter(r=>r.cohortIds.includes(person.cohort_id))],seen=new Set();
  for(const link of collection.links.filter(l=>l.cohortId===person.cohort_id)){
    const p=publications.get(link.publicationId);
    const author=p?.authors.find(a=>a.name===link.authorName);
    const valid=link.status==='SOURCE_CORROBORATED'&&p&&author&&nameKey(author.name)===nameKey(person.name)&&
      link.matchedAffiliations?.length&&link.matchedAffiliations.every(a=>author.affiliations.includes(a))&&
      link.profileSourceUrls?.some(u=>person.profile_urls.some(v=>urlKey(u)===urlKey(v)))&&
      urlKey(p.url)===urlKey(link.sourceUrl)&&provenance(source(p.url,link.checkedAt));
    if(!valid){held.push({...link,reason:'AUTHOR_LINK_PROVENANCE_REQUIRES_RECHECK'});continue;}
    if(seen.has(p.id))continue;
    seen.add(p.id);accepted.push({id:p.id,title:p.title,url:p.url,journal:p.journal,dates:p.dates,publicationTypes:p.publicationTypes,
      role:'AUTHOR',authorName:link.authorName,matchedAffiliations:link.matchedAffiliations,identityBasis:link.basis,
      source:source(p.url,link.checkedAt,'Author-specific affiliation in publication metadata'),sourceHash:p.sourceHash||null,
      clinicalFindingsAppraised:false,socialPost:false});
  }
  const search=collection.searches.find(s=>s.cohortId===person.cohort_id);
  const batch=collection.searchBatches.find(s=>s.id===search?.searchId);
  return {value:accepted.length?accepted:null,status:accepted.length?'SOURCE_SUPPORTED_PARTIAL':held.length?'REVIEW_REQUIRED':search?.status==='COMPLETE'?'SEARCHED_NO_CONFIRMED_MATCH':'UNRESOLVED',
    sources:accepted.map(p=>p.source),reviewCandidates:held,
    search:batch?{status:search.status,url:batch.sourceUrl,checkedAt:batch.checkedAt,query:batch.query,window:collection.window}:null,
    coverageComplete:false,reason:held.length?'Unresolved author identities remain; confirmed links retained':'Search is limited to the recorded time window and hospital affiliations; no claim of an exhaustive publication history',
    nextAction:held.length?'Resolve author identities using full names, institutions and publication-specific evidence':'Extend discovery beyond the recorded window and current institutional affiliations'};
}

export function reconcileMedicalReviews(person, discovery) {
  const accepted=[],held=[];
  for(const a of discovery.articles.filter(a=>a.sources.some(s=>s.cohortId===person.cohort_id))){
    const r=a.roleReview;
    if(!r||r.cohortId!==person.cohort_id||r.role!=='REVIEWER')continue;
    if(a.status!=='PAGE_CHECKED'||a.shared||a.sha256!==r.collectionSha256||!r.locator||!provenance(source(r.url,r.checkedAt))){held.push({url:a.url,reason:'ARTICLE_REVIEW_REQUIRES_RECHECK'});continue;}
    accepted.push({title:a.title,url:a.url,role:'MEDICAL_REVIEWER',authorshipEstablished:false,personalStatement:false,
      source:source(a.url,r.checkedAt,r.locator),collectionHash:a.sha256,publicationDate:a.date,publicationDateCandidates:a.dateCandidates,reviewIssues:a.reviewIssues});
  }
  return {value:accepted.length?accepted:null,status:accepted.length?'SOURCE_SUPPORTED_PARTIAL':'REVIEW_REQUIRED',sources:accepted.map(r=>r.source),reviewCandidates:held,coverageComplete:false,
    reason:'Reviewer credits do not establish authorship; unchecked article credits remain',nextAction:'Review remaining visible article credits and retain source-role distinctions'};
}

export function reconcileAccounts(person, accounts) {
  const selected=accounts.filter(a=>a.hcpId===person.cohort_id),accepted=[],held=[];
  for(const a of selected){
    const e=a.identityEvidence;
    const collision=accounts.some(b=>b.hcpId!==a.hcpId&&socialSourceKey(b.profileUrl,b.platform)===socialSourceKey(a.profileUrl,a.platform));
    if(a.identityStatus!=='VERIFIED'||!socialSourceKey(a.profileUrl,a.platform)||collision||!e||!Array.isArray(e.matchedFields)||e.matchedFields.length<2||
      !person.profile_urls.some(u=>urlKey(u)===urlKey(e.institutionUrl))||!provenance(source(a.profileUrl,e.checkedAt))){held.push({...a,reason:'ACCOUNT_IDENTITY_EVIDENCE_REQUIRES_RECHECK'});continue;}
    accepted.push({...a,ownershipAuthenticated:false,source:source(a.profileUrl,e.checkedAt,e.matchedFields.join('; '))});
  }
  return {value:accepted.length?accepted:null,status:accepted.length?'SOURCE_SUPPORTED_PARTIAL':'REVIEW_REQUIRED',sources:accepted.map(a=>a.source),reviewCandidates:held,coverageComplete:false,
    reason:'Public identity corroboration, not authenticated account control or exhaustive account discovery',nextAction:'Resolve remaining public professional accounts using independent clinical identity signals'};
}

export function applyManualFieldReviews(record, reviews, reviewDate) {
  let result=structuredClone(record);
  for(const review of reviews.filter(r=>r.hcpId===record.id)){
    if(nameKey(review.name)!==nameKey(record.fields.name.value)||!record.rawSourceRecord.profile_urls.some(u=>urlKey(u)===urlKey(review.url)))throw Error(`Manual review identity mismatch: ${record.id}`);
    result.manualReviews??=[];result.manualReviews.push(review);
    if(review.status!=='PAGE_READ')continue;
    const s=source(review.url,review.checkedAt||reviewDate,review.locator);
    if(!provenance(s))throw Error(`Manual review missing provenance: ${record.id}`);
    const mapping={specialty:'specialties',qualifications:'qualifications',institution:'institutions',city:'city',state:'state'};
    for(const [input,key] of Object.entries(mapping)){
      if(review.confirmed?.[input]==null)continue;
      const value=['specialties','qualifications','institutions'].includes(key)?[].concat(review.confirmed[input]):review.confirmed[input];
      result.fields[key]={value,status:'SOURCE_SUPPORTED',sources:[s],previousObservation:result.fields[key]};
    }
    for(const conflict of review.conflicts||[]){
      for(const key of conflict.parameter==='practiceLocation'?['city','state','institutions']:[conflict.parameter]){
        if(!result.fields[key])continue;
        result.fields[key]={...result.fields[key],status:'CONFLICT_REVIEW',conflicts:[...(result.fields[key].conflicts||[]),{...conflict,source:s}],coverageComplete:false,reason:conflict.resolution,nextAction:review.deferred?.find(d=>d.parameter===conflict.parameter)?.nextAction||'Resolve conflicting source claims'};
      }
    }
  }
  return result;
}

export function applySupplementaryReviews(record, reviews) {
  const result=structuredClone(record);
  for(const r of reviews.filter(r=>r.hcpId===record.id)){
    if(nameKey(r.name)!==nameKey(record.fields.name.value)||r.reviewStatus!=='SOURCE_CORROBORATED'||
      !record.rawSourceRecord.profile_urls.some(u=>urlKey(u)===urlKey(r.profileUrl))||
      !Array.isArray(r.matchedSignals)||r.matchedSignals.length<2||!provenance(r.source)||!r.source.locator)throw Error(`Invalid supplementary identity evidence: ${record.id}`);
    if(!['experience','conferenceParticipation','medicalReviews','authoredArticles'].includes(r.field))throw Error('Unsupported supplementary field');
    const previous=result.fields[r.field];
    const observations=[...(result.supplementaryReviews||[]),r];result.supplementaryReviews=observations;
    if(r.field==='experience'){
      if(r.value.status!=='HOSPITAL_REPORTED'||!Number.isFinite(r.value.minYears)||r.value.minYears<0||r.value.minYears>90)throw Error('Invalid experience observation');
      result.fields.experience={value:r.value,status:'HOSPITAL_REPORTED',sources:[r.source],previousObservation:previous};
    }else if(r.field==='authoredArticles'){
      if(r.value.role!=='AUTHOR'||r.value.authorshipEstablished!==true||!r.value.bylineAsReported)throw Error('Invalid article author role');
      const entries=[...(previous.value||[])];
      if(!entries.some(e=>urlKey(e.source?.url||e.url)===urlKey(r.source.url)))entries.push({...r.value,source:r.source,identityBasis:r.matchedSignals});
      result.fields.authoredArticles={value:entries,status:'SOURCE_SUPPORTED_PARTIAL',sources:[...(previous.sources||[]),r.source],coverageComplete:false,reason:'Explicit article byline; not an exhaustive article history',nextAction:'Check additional hospital and professional publisher articles'};
    }else if(r.field==='medicalReviews'){
      if(r.value.role!=='MEDICAL_REVIEWER'||r.value.authorshipEstablished!==false||r.value.personalStatement!==false)throw Error('Invalid medical review role');
      const entries=[...(previous.value||[])];
      if(!entries.some(e=>urlKey(e.source?.url||e.url)===urlKey(r.source.url)))entries.push({...r.value,source:r.source,identityBasis:r.matchedSignals});
      result.fields.medicalReviews={value:entries,status:'SOURCE_SUPPORTED_PARTIAL',sources:[...(previous.sources||[]),r.source],coverageComplete:false,reason:'Explicit medical-review credit; authorship is not established',nextAction:'Review additional publisher credits'};
    }else{
      const entries=[...(previous.value||[])];
      const eventKey=e=>JSON.stringify([urlKey(e.source?.url),e.event,e.year??null,e.role,e.presentationTitle??null,e.abstractNumber??null]);
      const entry={...r.value,source:r.source,identityBasis:r.matchedSignals};
      if(!entries.some(e=>eventKey(e)===eventKey(entry)))entries.push(entry);
      result.fields[r.field]={value:entries,status:'SOURCE_SUPPORTED_PARTIAL',sources:[...(previous.sources||[]),r.source],coverageComplete:false,reason:'Source-documented conference contribution; not a complete conference history or independent proof of attendance',nextAction:'Review additional official conference programmes'};
    }
    if(r.followUp){
      result.supplementaryFollowUps??=[];result.supplementaryFollowUps.push(r.followUp);
      if(r.followUp.parameter==='practiceLocation')for(const f of ['city','state','institutions'])result.fields[f]={...result.fields[f],status:'CONFLICT_REVIEW',reason:r.followUp.reason,nextAction:r.followUp.nextAction,coverageComplete:false,competingSource:r.source};
    }
  }
  return result;
}
