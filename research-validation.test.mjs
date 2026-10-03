import test from 'node:test';
import assert from 'node:assert/strict';
test('conference events sharing a source remain distinct and repeat imports do not inflate counts',()=>{
  const record={id:'p1',fields:{name:{value:person.name},conferenceParticipation:{value:null}},rawSourceRecord:person};
  const review={hcpId:'p1',name:person.name,profileUrl:person.profile_urls[0],field:'conferenceParticipation',reviewStatus:'SOURCE_CORROBORATED',matchedSignals:['Exact name','Hospital affiliation'],value:{event:'APICON',year:2004,role:'HOSPITAL_REPORTED_PRESENTER',presentationTitle:'Study A'},source:{url:person.profile_urls[0],checkedAt:'2026-10-03',locator:'Awards'}};
  const second={...review,value:{...review.value,event:'APHRS',year:2014,presentationTitle:'Study B'}};
  const result=applySupplementaryReviews(record,[review,second,review,second]);
  assert.equal(result.fields.conferenceParticipation.value.length,2);
  assert.equal(applySupplementaryReviews(result,[review,second]).fields.conferenceParticipation.value.length,2);
});
test('article bylines are required and unknown publication dates stay unknown',()=>{
  const record={id:'p1',fields:{name:{value:person.name},authoredArticles:{value:null}},rawSourceRecord:person};
  const review={hcpId:'p1',name:person.name,profileUrl:person.profile_urls[0],field:'authoredArticles',reviewStatus:'SOURCE_CORROBORATED',matchedSignals:['Name','Linked hospital profile'],value:{role:'AUTHOR',authorshipEstablished:true,bylineAsReported:'Article by Dr. Asha Kumar',publishedAt:null},source:{url:'https://hospital.example/article',checkedAt:'2026-10-03',locator:'Author footer'}};
  const result=applySupplementaryReviews(record,[review,review]);
  assert.equal(result.fields.authoredArticles.value.length,1);
  assert.equal(result.fields.authoredArticles.value[0].publishedAt,null);
  assert.throws(()=>applySupplementaryReviews(record,[{...review,value:{...review.value,bylineAsReported:null}}]),/author role/);
});
test('supplementary reviewer credits deduplicate and cannot become authored statements',()=>{
  const record={id:'p1',fields:{name:{value:person.name},medicalReviews:{value:null}},rawSourceRecord:person};
  const review={hcpId:'p1',name:person.name,profileUrl:person.profile_urls[0],field:'medicalReviews',reviewStatus:'SOURCE_CORROBORATED',matchedSignals:['Exact name','Profile links article'],value:{role:'MEDICAL_REVIEWER',authorshipEstablished:false,personalStatement:false},source:{url:'https://hospital.example/article',checkedAt:'2026-10-03',locator:'Medical review credit'}};
  const result=applySupplementaryReviews(record,[review,review]);
  assert.equal(result.fields.medicalReviews.value.length,1);
  assert.throws(()=>applySupplementaryReviews(record,[{...review,value:{...review.value,authorshipEstablished:true}}]),/review role/);
});
import {reconcilePublicationField,reconcileMedicalReviews,reconcileAccounts,applyManualFieldReviews,applySupplementaryReviews,buildLaterQueue,compareLaterPriority} from './research-validation.mjs';
test('near-complete priority counts unresolved fields, not repeated tasks',()=>{
  const a={name:'A',scope:'PRIORITY',missingParameters:[{parameter:'experience'},{parameter:'experience'},{parameter:'experience'}]};
  const b={name:'B',scope:'PRIORITY',missingParameters:[{parameter:'experience'},{parameter:'qualifications'}]};
  assert.ok(compareLaterPriority(a,b)<0);
  assert.ok(compareLaterPriority({...a,scope:'DEFERRED_SPECIALTY'},b)>0);
});
test('LATER retains specific follow-ups and claim provenance alongside generic field work',()=>{
  const followUp={parameter:'publications',reason:'Manuscript under process',nextAction:'Find published DOI'};
  const r={id:'p1',fields:{publications:{status:'REVIEW_REQUIRED'}},supplementaryFollowUps:[followUp,followUp],deferredClaims:[{parameter:'experience',status:'SPECIALIST_ONLY',url:'https://hospital.example/asha',checkedAt:'2026-10-03',valueAsReported:'9+ years',nextAction:'Find total experience'}]};
  const tasks=buildLaterQueue(r);
  assert.equal(tasks.length,3);
  assert.equal(tasks.filter(t=>t.parameter==='publications').length,2);
  assert.equal(tasks.find(t=>t.parameter==='experience').sourceUrl,r.deferredClaims[0].url);
  assert.throws(()=>buildLaterQueue({...r,deferredClaims:[{parameter:'experience'}]}),/Incomplete LATER/);
});
const person={cohort_id:'p1',name:'Asha Kumar',profile_urls:['https://hospital.example/asha']};
const pub={id:'PMID-1',url:'https://pubmed.ncbi.nlm.nih.gov/1/',title:'Study',authors:[{name:'Asha Kumar',affiliations:['Hospital A']}],dates:[]};
const link={publicationId:'PMID-1',cohortId:'p1',authorName:'Asha Kumar',matchedAffiliations:['Hospital A'],profileSourceUrls:person.profile_urls,status:'SOURCE_CORROBORATED',sourceUrl:pub.url,checkedAt:'2026-10-03'};
const collection={publications:[pub],links:[link,link],review:[],searches:[{cohortId:'p1',status:'COMPLETE',searchId:'s1'}],searchBatches:[{id:'s1',sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/',checkedAt:'2026-10-03'}],window:{start:'2025-09-30',end:'2026-09-30'}};
test('publication links deduplicate without calling a scoped search exhaustive',()=>{
  const f=reconcilePublicationField(person,collection);assert.equal(f.value.length,1);assert.equal(f.coverageComplete,false);assert.equal(f.value[0].role,'AUTHOR');
});
test('invalid author affiliation or identity is held rather than accepted',()=>{
  const f=reconcilePublicationField({...person,name:'Other Kumar'},collection);assert.equal(f.value,null);assert.equal(f.status,'REVIEW_REQUIRED');
  assert.equal(reconcilePublicationField(person,{...collection,links:[{...link,matchedAffiliations:['Elsewhere']}]}).value,null);
});
test('no confirmed publications is unknown history, not zero lifetime publications',()=>{
  const f=reconcilePublicationField(person,{...collection,links:[]});assert.equal(f.value,null);assert.equal(f.status,'SEARCHED_NO_CONFIRMED_MATCH');assert.deepEqual(f.search.window,collection.window);
});
test('reviewer credits require current hash and remain distinct from authorship',()=>{
  const a={url:'https://hospital.example/article',sources:[{cohortId:'p1'}],status:'PAGE_CHECKED',sha256:'abc',roleReview:{cohortId:'p1',role:'REVIEWER',collectionSha256:'abc',url:'https://hospital.example/article',locator:'Medical reviewer',checkedAt:'2026-10-03'}};
  const f=reconcileMedicalReviews(person,{articles:[a]});assert.equal(f.value[0].role,'MEDICAL_REVIEWER');assert.equal(f.value[0].authorshipEstablished,false);
  assert.equal(reconcileMedicalReviews(person,{articles:[{...a,sha256:'changed'}]}).value,null);
});
test('account VERIFIED flag alone cannot establish ownership',()=>{
  const a={hcpId:'p1',platform:'LinkedIn',profileUrl:'https://www.linkedin.com/in/asha',identityStatus:'VERIFIED'};
  assert.equal(reconcileAccounts(person,[a]).value,null);
  const supported={...a,identityEvidence:{institutionUrl:person.profile_urls[0],matchedFields:['Name','Hospital'],checkedAt:'2026-10-03'}};
  assert.equal(reconcileAccounts(person,[supported]).value[0].ownershipAuthenticated,false);
  assert.equal(reconcileAccounts(person,[supported,{...supported,hcpId:'other'}]).value,null);
});
test('manual geography conflict survives with competing observations',()=>{
  const r={id:'p1',fields:{name:{value:'Asha Kumar'},city:{value:'City One'},state:{value:'State One'},institutions:{value:['Hospital A']}},rawSourceRecord:person};
  const review={hcpId:'p1',name:person.name,url:person.profile_urls[0],status:'PAGE_READ',locator:'Hospital field',confirmed:{institution:'Hospital A'},conflicts:[{parameter:'practiceLocation',claims:['City One','City Two'],resolution:'Unresolved'}]};
  const f=applyManualFieldReviews(r,[review],'2026-10-03');assert.equal(f.fields.city.status,'CONFLICT_REVIEW');assert.equal(f.fields.city.conflicts[0].claims.length,2);assert.equal(r.fields.city.status,undefined);
  assert.throws(()=>applyManualFieldReviews(r,[{...review,name:'Other Doctor'}],'2026-10-03'),/identity mismatch/);
});
test('hospital experience preserves previous observation and practice conflict',()=>{
  const record={id:'p1',fields:{name:{value:person.name},experience:{value:null,status:'UNRESOLVED'},city:{value:'Old City'},state:{value:'Old State'},institutions:{value:['Old Hospital']}},rawSourceRecord:person};
  const review={hcpId:'p1',name:person.name,profileUrl:person.profile_urls[0],field:'experience',reviewStatus:'SOURCE_CORROBORATED',matchedSignals:['Full name','Qualifications'],value:{minYears:14,status:'HOSPITAL_REPORTED'},source:{url:'https://other-hospital.example/asha',checkedAt:'2026-10-03',locator:'Experience field'},followUp:{parameter:'practiceLocation',reason:'Different hospital affiliations',nextAction:'Verify current practice'}};
  const result=applySupplementaryReviews(record,[review]);assert.equal(result.fields.experience.value.minYears,14);assert.equal(result.fields.experience.previousObservation.value,null);assert.equal(result.fields.city.status,'CONFLICT_REVIEW');
  assert.throws(()=>applySupplementaryReviews(record,[{...review,matchedSignals:['Name']}]),/identity evidence/);
});
