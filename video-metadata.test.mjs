import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeVideoMetadata,enrichVideoDiscovery,titleNamesDoctor} from './video-metadata.mjs';
import {researchProfiles,researchInfo} from './data.mjs';
import {listeningCohort} from './listening-cohort.mjs';
import {videoMetadata} from './generated/video-metadata.mjs';
const raw={provider_name:'YouTube',type:'video',title:'Clinical discussion',author_name:'Hospital',author_url:'https://www.youtube.com/@hospital',html:'<script>bad</script>',thumbnail_url:'https://example.test/image',views:300};
const candidate={id:'YouTube:post:abcdefghijk',url:'https://www.youtube.com/watch?v=abcdefghijk',title:'Earlier title',reviewStatus:'REVIEW_REQUIRED',nativePostVerified:false};
const discovery={cohortHash:'test',summary:{cohortTotal:2024},doctors:[{cohortId:'a',candidates:[candidate]}]};
const record={...candidate,status:'METADATA_CHECKED',...sanitizeVideoMetadata(raw),checkedAt:'2026-09-30',sourceUrl:'https://www.youtube.com/oembed'};
test('only titles and publisher identity are retained; executable markup and metrics excluded',()=>{
  assert.deepEqual(Object.keys(sanitizeVideoMetadata(raw)),['title','publisher','publisherUrl']);
  assert.throws(()=>sanitizeVideoMetadata({...raw,author_url:'https://youtube.com.evil.test/@hospital'}));
  assert.throws(()=>sanitizeVideoMetadata({...raw,provider_name:'Unknown'}));
});
test('metadata enrichment does not verify clinician ownership or replace provenance',()=>{
  const result=enrichVideoDiscovery(discovery,{cohortHash:'test',records:[record]});
  const c=result.doctors[0].candidates[0];
  assert.equal(c.title,'Clinical discussion');assert.equal(c.hospitalTitle,'Earlier title');assert.equal(c.titleChanged,true);
  assert.equal(c.reviewStatus,'REVIEW_REQUIRED');assert.equal(c.nativePostVerified,false);
  assert.equal('publishedAt' in c,false);assert.equal('metrics' in c,false);
});
test('unavailable metadata stays distinct from deleted content',()=>{
  const c=enrichVideoDiscovery(discovery,{cohortHash:'test',records:[{...record,status:'HTTP_401'}]}).doctors[0].candidates[0];
  assert.equal(c.title,'Earlier title');assert.equal(c.videoMetadata.status,'HTTP_401');assert.equal(c.deleted,undefined);
});
test('cohort mismatch, duplicate records and video ID mismatch fail closed',()=>{
  assert.throws(()=>enrichVideoDiscovery(discovery,{cohortHash:'other',records:[]}));
  assert.throws(()=>enrichVideoDiscovery(discovery,{cohortHash:'test',records:[record,record]}));
  assert.throws(()=>enrichVideoDiscovery(discovery,{cohortHash:'test',records:[{...record,id:'wrong'}]}));
});
test('patient testimonials and success stories are excluded without exposing patient titles',()=>{
  const result=enrichVideoDiscovery(discovery,{cohortHash:'test',records:[{...record,title:'Named Patient Testimonial: Surgery Success Story'}]});
  assert.equal(result.doctors[0].candidates.length,0);assert.equal(result.summary.patientStoriesExcluded,1);
  assert.equal(result.summary.candidates,0);assert.equal(result.summary.doctorsWithCandidates,0);
  assert.equal(JSON.stringify(result).includes('Named Patient'),false);
  assert.equal(result.doctors[0].exclusions[0].reason,'PATIENT_STORY_NOT_CLINICIAN_COMMENTARY');
});
test('title attribution requires a unique full name and the doctor hospital backlink',()=>{
  const a={cohort_id:'a',name:'Anita Sharma',profile_urls:['https://hospital.test/anita']},sources=[{url:a.profile_urls[0]}];
  assert.equal(titleNamesDoctor('Clinical Talk | Dr. Anita Sharma',a,[a],sources),true);
  assert.equal(titleNamesDoctor('Clinical Talk | Dr. A Sharma',a,[a],sources),false);
  assert.equal(titleNamesDoctor('Clinical Talk | Dr. Anita Sharma',a,[a],[]),false);
  assert.equal(titleNamesDoctor('Clinical Talk | Dr. Anita Sharma',a,[a,{...a,cohort_id:'b'}],sources),false);
  assert.equal(titleNamesDoctor('Clinical Talk | Dr. Anita Sharma',a,[a,{cohort_id:'b',name:'Sharma'}],sources),true);
});
test('integrated counts agree without turning title matches into posts or statements',()=>{
  assert.equal(researchProfiles.length,2023);
  const candidates=researchProfiles.flatMap(p=>p.sourceDiscovery.candidates);
  assert.equal(candidates.filter(c=>c.titleAttribution==='NAMED_IN_TITLE').length,researchInfo.sourceDiscovery.titleMatchedVideos);
  assert.equal(listeningCohort.doctors.reduce((n,p)=>n+p.titleMatchedVideoCount,0),researchInfo.sourceDiscovery.titleMatchedVideos);
  const articleCandidates=researchProfiles.flatMap(p=>p.articleDiscovery.candidates);
  const manual=researchProfiles.flatMap(p=>p.footprints.filter(r=>r.discoverySourceUrl&&r.confidence==='UNVERIFIED'));
  assert.equal(listeningCohort.doctors.reduce((n,p)=>n+p.discoveredSourceCount,0),candidates.length+articleCandidates.length+manual.length);
  assert.equal(listeningCohort.posts.filter(p=>p.platform==='YouTube').length,0);
  assert.ok(candidates.every(c=>!c.nativePostVerified));
  assert.equal(videoMetadata.records.filter(r=>r.status==='EXCLUDED_PATIENT_STORY').length,researchInfo.sourceDiscovery.patientStoriesExcluded);
  assert.ok(videoMetadata.records.filter(r=>r.status==='EXCLUDED_PATIENT_STORY').every(r=>!r.title&&!r.publisher));
});
