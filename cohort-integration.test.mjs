import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedCohort } from './generated/confirmed-cohort.mjs';
import { researchProfiles, researchInfo, publicationReview, socialPosts } from './data.mjs';
import { integrateCohort } from './cohort-integration.mjs';
import { buildPersonas } from './persona-model.mjs';
import { onRequest } from './functions/api/[[path]].js';
import {reportedExperience} from './generated/reported-experience.mjs';
import {listeningCohort} from './listening-cohort.mjs';
import {experienceExclusions} from './experience-reviews.mjs';
import {applyCohortIdentityReviews, applyCohortSpecialtyReview, projectCollectionToCohort} from './cohort-review.mjs';

test('explicit cardiac anaesthesiology role overrides broad directory category without removing identity',()=>{
  const original=confirmedCohort.doctors.find(p=>p.cohort_id==='HCP-f783a3962420622eeb');
  const corrected=applyCohortSpecialtyReview(original);
  assert.deepEqual(corrected.specialties,['Cardiac Anaesthesiology']);
  assert.deepEqual(corrected.specialtyReview.asCollected,original.specialties);
  assert.notEqual(corrected,original);
  const live=researchProfiles.find(p=>p.id===original.cohort_id);
  assert.equal(live.specialty,'Cardiac Anaesthesiology');
  assert.ok(live.specialtyReview.url);
  assert.throws(()=>applyCohortSpecialtyReview({...original,name:'Different doctor'}),/revalidation/);
});

test('non-physician role review cannot become an experience archetype',()=>{
  for(const hold of experienceExclusions){
    const person=researchProfiles.find(p=>p.footprints.some(f=>f.url===hold.url));
    assert.ok(person);
    assert.equal(person.experience,null);
    assert.equal(person.roleReview.status,'PHYSICIAN_ROLE_REVIEW_REQUIRED');
    assert.equal(reportedExperience.some(r=>r.hcpId===person.id),false);
    assert.equal(buildPersonas([person])[0].persona,'Awaiting classification');
  }
});

test('captured records are either active or explicitly quarantined with original evidence',()=>{
  assert.equal(confirmedCohort.doctors.length,2024);
  assert.equal(researchProfiles.length,2023);
  assert.deepEqual(new Set([...researchProfiles.map(p=>p.id),...researchInfo.identityReview.map(r=>r.record.cohort_id)]),new Set(confirmedCohort.doctors.map(p=>p.cohort_id)));
  assert.equal(new Set(researchProfiles.map(p=>p.id)).size,researchProfiles.length);
  assert.equal(researchInfo.cohort.confirmed_unique_count,researchProfiles.length);
  assert.equal(researchInfo.identityReview[0].record.name,'Self Self');
  assert.equal(researchProfiles.some(p=>p.name==='Self Self'),false);
  assert.equal(listeningCohort.doctors.some(p=>p.id==='HCP-0538114585aa5b45df'),false);
});
test('identity review is exact, reversible and cannot silently discard new attributed evidence',()=>{
  const original=confirmedCohort.doctors.find(p=>p.name==='Self Self');
  assert.equal(applyCohortIdentityReviews(confirmedCohort,[]).doctors.length,2024);
  assert.throws(()=>applyCohortIdentityReviews({...confirmedCohort,doctors:[{...original,name:'New clinician identity'}]}),/revalidation/);
  assert.throws(()=>projectCollectionToCohort({summary:{cohortTotal:1},doctors:[{cohortId:original.cohort_id,candidates:[{url:'https://example.org'}]}]},{doctors:[]}),/evidence review/);
  assert.equal(original.status,'SOURCE_CONFIRMED_NOT_REGISTRY_VERIFIED');
});
test('cohort integration preserves provenance and does not invent registration, geography or influence',()=>{
  const sources=new Set([...confirmedCohort.sources,...researchInfo.additionalSources].map(s=>s.source_id));
  for(const p of researchProfiles.filter(p=>p.sourceConfirmed)){
    assert.equal(p.registryVerified,false);assert.equal(p.matchConfidence,null);
    if(p.experience){assert.ok(['HOSPITAL_REPORTED','QUALIFICATION_BASED_ESTIMATE'].includes(p.experience.status));assert.ok(p.experience.url&&p.experience.observedOn);assert.ok(p.footprints.some(r=>r.url===p.experience.profileUrl));}
    if(!p.legacyId){
      if(p.geographyEvidence){assert.equal(p.geographyEvidence.status,'HOSPITAL_LOCATION_REVIEWED');assert.ok(p.geographyEvidence.sourceUrl&&p.geographyEvidence.checkedAt&&p.geographyEvidence.locator);assert.notEqual(p.city,'Not verified');}
      else {assert.equal(p.city,'Not verified');assert.equal(p.region,'Not verified');}
    }
    else assert.ok(researchInfo.legacyLinks.some(l=>l.cohortId===p.id&&l.legacyId===p.legacyId));
    assert.ok(p.specialties.length);assert.ok(p.footprints.filter(e=>e.confidence==='SOURCE_CONFIRMED').every(e=>sources.has(e.sourceId)&&e.checkedAt&&e.sourceUrl));
  }
});
test('hospital experience enables provisional tiers while identity alone does not',()=>{
  const people=buildPersonas(researchProfiles.filter(p=>p.sourceConfirmed));
  const byDoctor=new Map();
  for(const observation of reportedExperience){
    if(!byDoctor.has(observation.hcpId))byDoctor.set(observation.hcpId,new Set());
    byDoctor.get(observation.hcpId).add(JSON.stringify([observation.years,Boolean(observation.lowerBound)]));
  }
  const consistentIds=[...byDoctor].filter(([,values])=>values.size===1).map(([id])=>id);
  assert.deepEqual(new Set(people.filter(p=>p.classificationStatus==='HOSPITAL_REPORTED').map(p=>p.id)),new Set(consistentIds));
  assert.equal(new Set(people.filter(p=>p.experience).map(p=>p.persona)).size,5);
  assert.ok(people.filter(p=>!p.experience).every(p=>p.persona==='Awaiting classification'));
  assert.ok(people.every(p=>!p.registryVerified));
  const listening=new Map(listeningCohort.doctors.map(p=>[p.id,p]));
  for(const p of people){assert.equal(listening.get(p.id).archetype,p.persona);assert.equal(listening.get(p.id).classificationStatus,p.classificationStatus);}
});
test('conflicting institutional experience does not hide independently attributed statements',()=>{
  const id='HCP-4aeea52efb2d0ff191';
  const person=researchProfiles.find(p=>p.id===id);
  assert.deepEqual(new Set(reportedExperience.filter(r=>r.hcpId===id).map(r=>r.years)),new Set([17,31]));
  assert.equal(person.experience,null);
  assert.equal(person.experienceReview,'CONFLICTING_REPORTED_EXPERIENCE');
  assert.equal(buildPersonas([person])[0].persona,'Awaiting classification');
  assert.deepEqual(listeningCohort.statements.find(r=>r.id==='R20260930-30').cohortIds,[id]);
});
test('name overlap is held without merging evidence into an existing identity',()=>{
  const p=confirmedCohort.doctors[0],existing={id:'existing',name:p.name,footprints:[],aliases:[]};
  const result=integrateCohort([existing],{doctors:[p]});
  assert.equal(result.profiles.length,1);assert.equal(result.profiles[0].id,p.cohort_id);assert.equal(result.review.length,1);assert.deepEqual(existing.footprints,[]);
});
test('publication remains review-stage metadata, not a post or an assigned doctor record',()=>{
  assert.ok(publicationReview.items.length>1);
  assert.equal(publicationReview.includedInListening,false);
  assert.deepEqual(publicationReview.items[0].doctor_identity_links,[]);
  assert.ok(!socialPosts.some(p=>p.url===publicationReview.items[0].source_url));
});
test('Cloudflare research and publication routes return shared, governed data',async()=>{
  for(const path of ['research','publication-review']){
    const r=await onRequest({request:new Request(`https://example.test/api/${path}`),params:{path}});
    assert.equal(r.status,200);const body=await r.json();
    assert.equal(body.items.length,path==='research'?researchProfiles.length:publicationReview.items.length);
    if(path==='research')assert.equal(body.cohort.registry_verified_count,0);
  }
});
