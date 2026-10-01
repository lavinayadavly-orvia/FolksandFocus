import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProfileDiscovery,enrichDiscoveryProfiles} from './profile-source-discovery.mjs';
import {profileSourceDiscovery} from './generated/profile-source-discovery.mjs';
import {confirmedCohort} from './generated/confirmed-cohort.mjs';
const people=[{cohort_id:'a'},{cohort_id:'b'}];
const shared={url:'https://x.com/hospital',platform:'X',locator:'a'};
const video={url:'https://youtube.com/embed/abcdefghijk',platform:'YouTube',locator:'iframe'};
const row=(cohortId,links,status='PAGE_CHECKED')=>({cohortId,links,status,url:`https://hospital.test/${cohortId}`,checkedAt:'2026-09-30',sha256:'abc'});
test('shared footer accounts do not become doctor accounts',()=>{
  const r=resolveProfileDiscovery(people,{profiles:[row('a',[shared,video]),row('b',[shared])]});
  assert.equal(r.summary.candidates,1);assert.equal(r.summary.sharedLinkOccurrencesExcluded,2);
  assert.equal(r.doctors[0].candidates[0].url,'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(r.doctors[0].candidates[0].nativePostVerified,false);
});
test('embed and watch URL deduplicate while retaining source locators',()=>{
  const r=resolveProfileDiscovery(people,{profiles:[row('a',[video,{...video,url:'https://youtube.com/watch?v=abcdefghijk',locator:'VideoObject',title:'A clinical talk'}])]});
  assert.equal(r.summary.candidates,1);assert.equal(r.doctors[0].candidates[0].sources.length,2);
  assert.equal(r.doctors[0].candidates[0].title,'A clinical talk');
});
test('access restrictions are not completed page checks or evidence of inactivity',()=>{
  const r=resolveProfileDiscovery(people,{profiles:[row('a',[],'ROBOTS_DISALLOWED'),row('b',[],'HTTP_403')]});
  assert.equal(r.summary.cohortTotal,2);assert.equal(r.summary.doctorsWithPageChecks,0);
  assert.equal(r.doctors[0].pages[0].status,'ROBOTS_DISALLOWED');
});
test('enrichment preserves evidence and never promotes discovered records into footprints',()=>{
  const d=resolveProfileDiscovery(people,{profiles:[row('a',[video])]});
  const p=enrichDiscoveryProfiles([{id:'a',footprints:[]}],d)[0];
  assert.equal(p.footprints.length,0);assert.equal(p.sourceDiscovery.candidates.length,1);
  assert.equal(p.sourceDiscovery.candidates[0].reviewStatus,'REVIEW_REQUIRED');
});
test('completed discovery accounts for every canonical doctor and retains source provenance',()=>{
  assert.equal(profileSourceDiscovery.cohortHash,confirmedCohort.checksum);
  assert.deepEqual(new Set(profileSourceDiscovery.doctors.map(p=>p.cohortId)),new Set(confirmedCohort.doctors.map(p=>p.cohort_id)));
  for(const doctor of profileSourceDiscovery.doctors){
    const cohort=confirmedCohort.doctors.find(p=>p.cohort_id===doctor.cohortId);
    assert.equal(doctor.pages.length,cohort.profile_urls.length);
    assert.equal(new Set(doctor.candidates.map(c=>c.id)).size,doctor.candidates.length);
    for(const record of doctor.candidates){
      assert.equal(record.reviewStatus,'REVIEW_REQUIRED');assert.equal(record.nativePostVerified,false);
      assert.ok(record.sources.length);
      assert.ok(record.sources.every(s=>cohort.profile_urls.includes(s.url)&&s.checkedAt&&/^[a-f0-9]{64}$/.test(s.sha256)));
    }
  }
  assert.equal(profileSourceDiscovery.summary.candidates,profileSourceDiscovery.doctors.reduce((n,p)=>n+p.candidates.length,0));
});
