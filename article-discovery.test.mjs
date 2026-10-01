import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveArticleDiscovery,enrichArticleProfiles,applyArticleReviews} from './article-discovery.mjs';
import {researchProfiles,articleDiscovery} from './data.mjs';
import {listeningCohort} from './listening-cohort.mjs';
import {onRequest} from './functions/api/[[path]].js';
import {sourceReviewRecords} from './source-review.mjs';
import {publicAsset} from './backend/static-assets.mjs';
const url='https://hospital.test/blog/topic/';
const cohort={checksum:'test',doctors:[{cohort_id:'a',profile_urls:['https://hospital.test/doctors/a/']},{cohort_id:'b',profile_urls:['https://hospital.test/doctors/b/']}]};
const collection=()=>({cohortHash:'test',profiles:[{cohortId:'a',url:cohort.doctors[0].profile_urls[0],status:'PAGE_CHECKED',articleLinks:[url]}],articles:[{url,status:'PAGE_CHECKED',title:'Clinical article',profileBacklinks:[{cohortId:'a',profileUrl:cohort.doctors[0].profile_urls[0]}],articleMetadata:[]}],limitations:[]});
test('reviewer evidence stays distinct from authorship and is invalidated by changed content or identity',()=>{
 const c=collection();c.articles[0].sha256='snapshot';
 const original=resolveArticleDiscovery(cohort,c);
 const review={url,cohortId:'a',collectionSha256:'snapshot',checkedAt:'2026-09-30',role:'REVIEWER',locator:'Visible review credit',relationship:'Clinical reviewer'};
 const resolved=applyArticleReviews(original,[review]);
 assert.equal(resolved.articles[0].roleReview.role,'REVIEWER');
 assert.equal(resolved.doctors[0].candidates[0],resolved.articles[0]);
 assert.equal(resolved.articles[0].attributionStatus,'UNVERIFIED');
 assert.equal(resolved.articles[0].nativePostVerified,false);
 assert.equal(original.articles[0].roleReview,undefined);
 for(const change of [{collectionSha256:'changed'},{cohortId:'b'}]){
  const stale=applyArticleReviews(original,[{...review,...change}]);
  assert.equal(stale.articles[0].roleReview,undefined);
  assert.ok(stale.articles[0].reviewIssues.includes('MANUAL_REVIEW_REQUIRES_RECHECK'));
 }
 assert.throws(()=>applyArticleReviews(original,[review,{...review,url:url+'?tracking=x'}]),/duplicate/);
 assert.throws(()=>applyArticleReviews(original,[{...review,role:'AUTHOR'}]),/Incomplete/);
});
test('article coverage accounts for every doctor without treating unchecked profiles as inactive',()=>{
 const d=resolveArticleDiscovery(cohort,collection());
 assert.deepEqual(d.summary.counts,{PROFILE_CHECKED:1,PROFILE_ACCESS_UNAVAILABLE:0,NOT_CHECKED:1});
 assert.equal(d.doctors[1].candidates.length,0);assert.equal(d.articles[0].nativePostVerified,false);
 assert.equal(d.articles[0].attributionStatus,'UNVERIFIED');
 const p=enrichArticleProfiles([{id:'a',footprints:[]}],d)[0];assert.equal(p.footprints.length,0);assert.equal(p.articleDiscovery.candidates.length,1);
});
test('repeated untitled responses keep their provenance but cannot inflate articles read',()=>{
 const c=collection(),other='https://hospital.test/blog/other/';
 c.profiles[0].articleLinks.push(other);
 Object.assign(c.articles[0],{title:'',sha256:'same-response'});
 c.articles.push({...c.articles[0],url:other});
 for(const articles of [c.articles,[...c.articles].reverse()]){
  const d=resolveArticleDiscovery(cohort,{...c,articles});
  assert.equal(d.summary.articleCandidates,2);assert.equal(d.summary.articlesRead,0);
  assert.equal(d.summary.contentUnconfirmed,2);assert.equal(d.doctors[0].candidates.length,2);
  for(const a of d.articles){
   assert.equal(a.status,'CONTENT_UNCONFIRMED');assert.equal(a.collectionStatus,'PAGE_CHECKED');
   assert.ok(a.sources.length);assert.ok(a.reviewIssues.includes('REPEATED_UNINFORMATIVE_RESPONSE'));
  }
  const cards=sourceReviewRecords({articleDiscovery:d.doctors[0]});
  assert.ok(cards.every(r=>r.summary.includes('Article content not confirmed')));
 }
 const informative=resolveArticleDiscovery(cohort,{...c,articles:c.articles.map(a=>({...a,title:'Named clinical article'}))});
 assert.equal(informative.summary.articlesRead,2);
 assert.equal(resolveArticleDiscovery(cohort,{...c,articles:[c.articles[0]]}).summary.contentUnconfirmed,0);
 assert.equal(c.articles[0].status,'PAGE_CHECKED');
});
test('checked Aster reviewer credits reach profiles without becoming personal statements or posts',()=>{
 const reviewed=articleDiscovery.articles.filter(a=>a.url.includes('asterhospitals.in')&&a.roleReview);
 assert.equal(reviewed.length,6);
 for(const article of reviewed){
  assert.equal(article.roleReview.role,'REVIEWER');
  assert.equal(article.roleReview.collectionSha256,article.sha256);
  assert.ok(article.reviewIssues.includes('REVIEWER_CREDIT_NOT_AUTHORSHIP'));
  assert.equal(article.attributionStatus,'UNVERIFIED');
  assert.equal(article.nativePostVerified,false);
  const profile=researchProfiles.find(p=>p.id===article.roleReview.cohortId);
  assert.equal(profile.articleDiscovery.candidates.find(a=>a.id===article.id).roleReview.role,'REVIEWER');
  const card=sourceReviewRecords(profile).find(r=>r.url===article.url);
  assert.match(card.summary,/Medical-review credit checked/);
  assert.doesNotMatch(card.summary,/attribution awaits review/);
  assert.match(card.summary,/personal commentary are not established/);
  assert.equal(card.confidence,'REVIEW');
  assert.ok(!listeningCohort.statements.some(s=>s.sourceEvidence?.url===article.url));
  assert.ok(!listeningCohort.posts.some(s=>s.url===article.url));
 }
});
test('source cards preserve unresolved date and expired-review warnings together',()=>{
 const record={url,status:'PAGE_CHECKED',reviewIssues:['CONFLICTING_PUBLICATION_DATES','MANUAL_REVIEW_REQUIRES_RECHECK']};
 const [card]=sourceReviewRecords({articleDiscovery:{candidates:[record]}});
 assert.match(card.summary,/attribution awaits review/);
 assert.match(card.summary,/Earlier attribution needs rechecking/);
 assert.match(card.summary,/conflicting publication dates/);
 assert.doesNotMatch(card.summary,/credit checked/);
});
test('Manipal reviewer roles are retained without treating author metadata as personal commentary',()=>{
 for(const id of ['HCP-5a4cffebc04a08a942','HCP-c4949ab28775bba01a']){
  const profile=researchProfiles.find(p=>p.id===id);
  const article=profile.articleDiscovery.candidates.find(a=>a.roleReview?.cohortId===id);
  assert.ok(article);assert.equal(article.roleReview.collectionSha256,article.sha256);
  assert.equal(article.roleReview.role,'REVIEWER');
  assert.ok(article.reportedMetadata.some(m=>m.credits.some(c=>c.relationship==='author')));
  assert.ok(article.reviewIssues.includes('REVIEWER_CREDIT_NOT_AUTHORSHIP'));
  assert.match(sourceReviewRecords(profile).find(r=>r.url===article.url).summary,/Medical-review credit checked/);
  assert.ok(!listeningCohort.statements.some(s=>s.cohortIds.includes(id)));
  assert.ok(!listeningCohort.posts.some(p=>p.hcpId===id));
 }
});
test('unknown IDs, source mismatches, checksum mismatch and duplicate URL aliases fail closed',()=>{
 for(const mutate of [c=>c.cohortHash='wrong',c=>c.profiles[0].cohortId='z',c=>c.profiles[0].url='https://other.test/a',c=>c.profiles[0].articleLinks=[],c=>c.articles.push({...c.articles[0],url:url+'?utm_source=x'})]){
  const c=collection();mutate(c);assert.throws(()=>resolveArticleDiscovery(cohort,c));
 }
});
test('conflicting dates remain unresolved and author metadata does not establish authorship',()=>{
 const c=collection();c.articles[0].articleMetadata=[{datePublishedAsReported:'2026-01-01',credits:[{relationship:'author',name:'Doctor A'}]},{datePublishedAsReported:'2026-02-01'}];
 const a=resolveArticleDiscovery(cohort,c).articles[0];assert.equal(a.date,null);assert.deepEqual(a.reviewIssues,['CONFLICTING_PUBLICATION_DATES']);assert.equal(a.attributionStatus,'UNVERIFIED');
});
test('excluded article aliases still fail duplicate validation',()=>{
 const c=collection();c.articles[0].title='A patient success story';
 c.articles.push({...c.articles[0],title:'Clinical article',url:url+'#article'});
 assert.throws(()=>resolveArticleDiscovery(cohort,c),/Duplicate article URL/);
});
test('Kauvery shared navigation indexes are not counted as article candidates',()=>{
 const hospital='https://www.kauveryhospital.com';
 const doctor={cohort_id:'a',profile_urls:[hospital+'/doctors/a/']};
 const urls=['/news-events/press-releases/','/news-events/vaazhga-nalamudan/','/news-events/february-giddiness-and-fainting/'].map(p=>hospital+p);
 const c={cohortHash:'test',profiles:[{cohortId:'a',url:doctor.profile_urls[0],status:'PAGE_CHECKED',articleLinks:urls}],articles:urls.map(url=>({url,status:'PAGE_CHECKED',title:'Hospital Page',profileBacklinks:[{cohortId:'a',profileUrl:doctor.profile_urls[0]}]})),limitations:[]};
 const r=resolveArticleDiscovery({checksum:'test',doctors:[doctor]},c);
 assert.equal(r.articles.length,1);assert.equal(r.articles[0].url,urls[2]);
 assert.equal(r.doctors[0].candidates.length,1);
 assert.equal(r.review.length,2);assert.ok(r.review.every(x=>x.reason==='HOSPITAL_NAVIGATION_EXCLUDED'));
});
test('non-string publication dates remain unknown rather than crashing or inventing a date',()=>{
 const c=collection();c.articles[0].articleMetadata=[{datePublishedAsReported:2026},{datePublishedAsReported:{year:2026}}];
 const a=resolveArticleDiscovery(cohort,c).articles[0];
 assert.equal(a.date,null);assert.deepEqual(a.dateCandidates,[]);assert.equal(a.attributionStatus,'UNVERIFIED');
});
test('shared hospital links and patient stories are not assigned as individual doctor activity',()=>{
 const c=collection();c.profiles.push({cohortId:'b',url:cohort.doctors[1].profile_urls[0],status:'PAGE_CHECKED',articleLinks:[url]});c.articles[0].profileBacklinks.push({cohortId:'b',profileUrl:cohort.doctors[1].profile_urls[0]});
 const d=resolveArticleDiscovery(cohort,c);assert.equal(d.summary.sharedArticles,1);assert.equal(d.summary.doctorsWithCandidates,0);
 c.articles[0].title='A patient success story';const excluded=resolveArticleDiscovery(cohort,c);assert.equal(excluded.articles.length,0);assert.equal(excluded.review[0].reason,'PATIENT_STORY_EXCLUDED');
});
test('both APIs and doctor profiles share article-review coverage without adding commentary',async()=>{
 const api=await(await onRequest({request:new Request('https://example.test/api/article-discovery'),params:{path:'article-discovery'}})).json();
 assert.equal(api.summary.cohortTotal,2023);
 assert.equal(Object.values(api.summary.counts).reduce((a,b)=>a+b,0),2023);
 assert.deepEqual(api.summary,articleDiscovery.summary);
 assert.deepEqual(new Set(api.doctors.map(d=>d.cohortId)),new Set(researchProfiles.map(d=>d.id)));
 for(const p of researchProfiles){
  const listening=listeningCohort.doctors.find(d=>d.id===p.id);
  assert.equal(listening.articleSourceCount,p.articleDiscovery.candidates.length);
  assert.equal(listening.discoveredSourceCount,sourceReviewRecords(p).length);
  assert.ok(p.articleDiscovery.candidates.every(c=>c.attributionStatus==='UNVERIFIED'&&!c.nativePostVerified&&c.date===null));
 }
 assert.equal(listeningCohort.statements.length,46);
 assert.ok(listeningCohort.posts.every(p=>!articleDiscovery.articles.some(a=>a.url===p.url)));
});
test('manual source candidates share review totals without promoting accounts or duplicating URL aliases',()=>{
 const person={sourceDiscovery:{candidates:[{url:'https://twitter.com/DoctorA',platform:'X',kind:'ACCOUNT',sources:[{url:'https://hospital.test/doctor'}]}]},articleDiscovery:{candidates:[{url:'https://hospital.test/article',reviewIssues:[],sources:[]}]},footprints:[
  {id:'manual',type:'SOCIAL',publisher:'X',url:'https://x.com/doctora?utm_source=share',confidence:'UNVERIFIED',discoverySourceUrl:'https://doctor.test/'},
  {id:'instagram',type:'SOCIAL',publisher:'Instagram',url:'https://instagram.com/doctorA',confidence:'UNVERIFIED',discoverySourceUrl:'https://doctor.test/'},
  {id:'verified',type:'SOCIAL',url:'https://x.com/known',confidence:'VERIFIED',discoverySourceUrl:'https://doctor.test/'},
  {id:'invalid',type:'SOCIAL',url:'javascript:alert(1)',confidence:'UNVERIFIED',discoverySourceUrl:'https://doctor.test/'}
 ]};
 const rows=sourceReviewRecords(person);
 assert.equal(rows.length,3);
 assert.equal(rows.find(r=>r.platform==='X').discoverySources.length,2);
 assert.equal(rows.filter(r=>r.confidence==='VERIFIED').length,0);
 assert.equal(sourceReviewRecords({...person,records:person.footprints,footprints:undefined}).length,3);
 assert.equal(sourceReviewRecords({}).length,0);
 for(const asset of ['source-review.mjs','social-identity.mjs'])assert.equal(publicAsset('/'+asset),asset);
 const divya=researchProfiles.find(p=>p.id==='HCP-f103511d7be987c90d');
 assert.equal(sourceReviewRecords(divya).length,3);
 assert.equal(listeningCohort.doctors.find(p=>p.id===divya.id).discoveredSourceCount,3);
 assert.equal(listeningCohort.accounts.some(a=>a.hcpId===divya.id),false);
});
