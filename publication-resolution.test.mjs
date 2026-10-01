import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePublications,enrichPublicationProfiles,publicationDate} from './publication-resolution.mjs';
import {cohortPublications as collectedPublications} from './generated/cohort-publications.mjs';
import {researchProfiles,cohortPublications} from './data.mjs';
import {onRequest} from './functions/api/[[path]].js';
const people=[{cohort_id:'p1',name:'Anita Sharma',institutions:['Max Healthcare'],profile_urls:['https://example.org/anita']}];
const collection=authors=>({publications:[{id:'PMID-1',url:'https://pubmed.ncbi.nlm.nih.gov/1/',title:'Study',authors,dates:[{Year:'2026',Month:'Sep',basis:'JOURNAL_ISSUE'}]}],searches:[{cohortIds:['p1'],status:'COMPLETE'}]});
test('full name plus author-specific hospital supports a link',()=>{
  const data=resolvePublications(people,collection([{name:'Anita Sharma',affiliations:['Max Super Speciality Hospital, Delhi']}])) ;
  assert.equal(data.summary.authorLinks,1);assert.equal(data.summary.searched,1);
  const profiles=enrichPublicationProfiles([{id:'p1',footprints:[]}],data);
  assert.equal(profiles[0].footprints[0].type,'PUBLICATION');assert.equal(profiles[0].footprints[0].date,'2026-09');
});
test('another author affiliation cannot corroborate a name',()=>{
  const data=resolvePublications(people,collection([{name:'Anita Sharma',affiliations:['Other Hospital']},{name:'Different Person',affiliations:['Max Hospital']}])) ;
  assert.equal(data.links.length,0);assert.equal(data.review.length,1);
});
test('initials and institution-only matches remain reviewable',()=>{
  const data=resolvePublications(people,collection([{name:'A Sharma',affiliations:['Max Hospital']}])) ;
  assert.equal(data.links.length,0);assert.equal(data.review[0].reason,'ABBREVIATED_NAME');
});
test('duplicate full name and institution is ambiguous, not two confirmed doctors',()=>{
  const data=resolvePublications([...people,{...people[0],cohort_id:'p2'}],collection([{name:'Anita Sharma',affiliations:['Max Hospital']}])) ;
  assert.equal(data.links.length,0);assert.equal(data.review[0].reason,'AMBIGUOUS_COHORT_IDENTITY');
});
test('generic max or care text is not a hospital affiliation',()=>{
  assert.equal(resolvePublications(people,collection([{name:'Anita Sharma',affiliations:['Max Planck Institute']}])).links.length,0);
});
test('partial dates are not assigned fictional days',()=>{
  assert.equal(publicationDate({dates:[{Year:'2026'}]}),'2026');
  assert.equal(publicationDate({dates:[{basis:'Electronic',Year:'2026',Month:'2',Day:'3'}]}),'2026-02-03');
  assert.equal(publicationDate({}),null);
});
test('missing search results are failures, not completed checks',()=>{
  const data=resolvePublications(people,{publications:[],searches:[]});
  assert.equal(data.summary.searched,0);assert.equal(data.searches[0].status,'SEARCH_FAILED');
});
test('imported collection accounts for every cohort ID and keeps review separate',()=>{
  const d=cohortPublications,ids=new Set(researchProfiles.map(p=>p.id));
  assert.equal(d.summary.searched,2023);
  assert.equal(d.summary.collectedCohortTotal,2024);
  assert.equal(collectedPublications.searches.length,2024);
  assert.deepEqual(new Set(d.searches.map(s=>s.cohortId)),ids);
  assert.ok(d.searches.every(s=>s.status==='COMPLETE'&&d.searchBatches.some(b=>b.id===s.searchId&&b.cohortIds.includes(s.cohortId))));
  assert.equal(new Set(d.links.map(l=>l.cohortId)).size,d.summary.doctorsWithPublications);
  assert.equal(new Set(d.links.map(l=>l.publicationId)).size,d.summary.linkedPublications);
  assert.equal(new Set(d.links.map(l=>`${l.cohortId}:${l.publicationId}`)).size,d.links.length);
  assert.ok(d.links.every(l=>ids.has(l.cohortId)&&l.profileSourceUrls.length&&l.matchedAffiliations.length&&l.sourceUrl));
  assert.ok(d.review.every(r=>r.status==='REVIEW_REQUIRED'));
  assert.ok(d.publications.every(p=>p.socialPost===false&&p.clinicalFindingsAppraised===false));
  assert.equal(researchProfiles.filter(p=>p.footprints.some(r=>r.id.startsWith('PMID-'))).length,d.summary.doctorsWithPublications);
});
test('Cloudflare collection exposes the same provenance and counts',async()=>{
  const response=await onRequest({request:new Request('https://example.test/api/publication-collection'),params:{path:'publication-collection'}});
  assert.equal(response.status,200);
  const data=await response.json();assert.deepEqual(data.summary,cohortPublications.summary);
  assert.ok(data.searchBatches.every(b=>b.sourceUrl.startsWith('https://eutils.ncbi.nlm.nih.gov/')));
});
