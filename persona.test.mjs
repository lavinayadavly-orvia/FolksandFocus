import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPersona,buildPersonas,inPersonaGroup,pageItems,uniqueRecords,personaGroups,profileLocationLabel} from './persona-model.mjs';
const now=new Date('2026-09-28T00:00:00Z');
import {mbbsCompletionYear,attachQualificationExperience} from './qualification-experience.mjs';
test('qualification ranges allow explicit end months without accepting unrelated years',()=>{
 const now=new Date('2026-10-01');
 assert.equal(mbbsCompletionYear('MBBS (Sept 2007 - Dec 2012)',now),2012);
 assert.equal(mbbsCompletionYear('MBBS (2007 to December 2012)',now),2012);
 assert.equal(mbbsCompletionYear('MBBS 2007; award December 2012',now),null);
 assert.equal(mbbsCompletionYear('MBBS - Tirunelveli Medical College | 2004',now),2004);
 assert.equal(mbbsCompletionYear('MBBS | MD | 2010',now),null);
 assert.equal(mbbsCompletionYear('MBBS | 2004 | MD | 2010',now),2004);
 assert.equal(mbbsCompletionYear('MBBS at College, and subsequently earned her MS in 2024',now),null);
 assert.equal(mbbsCompletionYear('MBBS in 2010 and earned her MS in 2014',now),2010);
 assert.equal(mbbsCompletionYear('MBBS (1993-1998) and masters degree (2000-2004)',now),1998);
 assert.equal(mbbsCompletionYear('MBBS, then DCH in 1979',now),null);
 assert.equal(mbbsCompletionYear('Honor in MBBS 2nd Prof, 1999; MD 2005',now),null);
 assert.equal(mbbsCompletionYear('MBBS degree earned in 2010. Doctor of Medicine in 2016.',now),2010);
 assert.equal(mbbsCompletionYear('MBBS from Imphal. Completed MRCOG exams in 2025.',now),null);
 assert.equal(mbbsCompletionYear('MBBS in 2001, followed by Primary D.N.B. in 2003.',now),2001);
});
test('reviewed qualification observations require matching identity and retain index access status',()=>{
  const profile={id:'one',name:'Doctor One',footprints:[{type:'INSTITUTION',url:'https://hospital.org/one'}]};
  const claim={hcpId:'one',nameAsReported:'Doctor One',profile_url:'https://hospital.org/one',qualifications:'M.B.B.S. (2011)',checked_at:'2026-09-30',identityBasis:'Exact institutional profile',sourceLocator:'Overview',sourceAccessStatus:'PUBLIC_INDEX_READ',accessNote:'Indexed source only'};
  const [p]=attachQualificationExperience([profile],[],now,[claim]);
  assert.equal(p.experience.minYears,15);
  assert.equal(p.experience.status,'QUALIFICATION_BASED_ESTIMATE');
  assert.equal(p.experience.sourceAccessStatus,'PUBLIC_INDEX_READ');
  assert.match(p.experience.basis,/Indexed source only/);
  assert.equal(attachQualificationExperience([profile],[],now,[{...claim,nameAsReported:'Other'}])[0].experience,undefined);
  assert.equal(attachQualificationExperience([profile],[],now,[{...claim,profile_url:'https://hospital.org/other'}])[0].experience,undefined);
});
test('graduation-based estimates use MBBS completion, never postgraduate or unrelated dates',()=>{
  for(const [text,year] of [['MBBS (1994) | DNB (2001)',1994],['MBBS (2007-2013)',2013],['MBBS (2006 to 2011)',2011],['MBBS (2006 TO 2011)',2011],['MBBS 2006 and 2011',null],['MBBS 1990 to 2011',null],['MBBS 2011 to 2006',null],['MD 2016 M.B.B.S (University 2010)',2010],['MBBS | MD 2008',null],['MBBS, MD Advanced Training 2010',null],['MBBS 2030',null]])assert.equal(mbbsCompletionYear(text,now),year);
  const profile={id:'one',footprints:[{type:'INSTITUTION',url:'https://hospital.org/one'}]};
  const cohort=[{cohort_id:'one',evidence:[{profile_url:'https://hospital.org/one',qualifications:'MBBS 2000',checked_at:'2026-09-30'}]}];
  const [p]=attachQualificationExperience([profile],cohort,now);
  assert.equal(p.tier,'Trendsetters');assert.equal(p.experience.minYears,26);assert.equal(p.classificationStatus,'QUALIFICATION_BASED_ESTIMATE');assert.equal(p.registryVerified,undefined);
  assert.match(p.experience.basis,/not confirmed years of practice/);
  assert.equal(attachQualificationExperience([{...profile,experience:{label:'Existing'}}],cohort,now)[0].experience.label,'Existing');
});
import {attachReportedExperience,classifyExperience,consistentReportedAmounts,reviewedExperienceRecords} from './reported-experience.mjs';
test('professional and practice-start sources retain accurate provenance labels',()=>{
  const url='https://hospital.org/one';
  const profile={id:'one',footprints:[{type:'INSTITUTION',url}]};
  const row={hcpId:'one',years:38,lowerBound:true,profileUrl:url,sourceUrl:url,publisher:'Hospital',checkedAt:'2026-10-01'};
  const [estimate]=attachReportedExperience([profile],[{...row,sourceKind:'HOSPITAL_PRACTICE_START_ESTIMATE'}]);
  assert.equal(estimate.tier,'Trailblazers');
  assert.match(estimate.experience.label,/Practice-start estimate/);
  assert.match(estimate.experience.basis,/estimated from the practice start/);
  const [professional]=attachReportedExperience([profile],[{...row,years:21,lowerBound:false,sourceKind:'PROFESSIONAL_BIOGRAPHY'}]);
  assert.equal(professional.tier,'Rising Stars');
  assert.match(professional.experience.label,/Source reported/);
  assert.equal(professional.experience.sourceKind,'PROFESSIONAL_BIOGRAPHY');
});
test('fractional hospital experience retains its value without gaps between archetypes',()=>{
  for(const [years,label] of [[2.6,'Early Sparks'],[9.9,'Early Sparks'],[10,'Frontline Fair'],[17.9,'Frontline Fair'],[18,'Rising Stars'],[24.9,'Rising Stars'],[25,'Trendsetters'],[34.9,'Trendsetters'],[35,'Trailblazers']]){
    const result=classifyExperience({experience:{minYears:years,maxYears:years,url:'https://hospital.org/doctor',observedOn:'2026-10-01'}});
    assert.equal(result.label,label);assert.equal(result.years,years);
  }
  assert.equal(classifyExperience({experience:{minYears:9,maxYears:10,url:'https://hospital.org/doctor',observedOn:'2026-10-01'}}),null);
});
test('reviewed hospital source priority retains competing claims and rejects ambiguous identities or equal-rank conflicts',()=>{
  const url='https://hospital.org/doctor';
  const claim={profileUrl:url,nameAsReported:'Doctor',years:15,lowerBound:true,sourceLocator:'Experience field',asReported:'15+ years',sourceKind:'HOSPITAL_EXPERIENCE_FIELD'};
  const other={...claim,years:20,asReported:'20 years',sourceKind:'THIRD_PARTY_DIRECTORY'};
  const page={url,checkedAt:'2026-10-01',sourcePriorityReview:{checkedAt:'2026-10-01',basis:'Hospital field takes precedence over directory'},experienceCandidates:[claim,other]};
  assert.equal(reviewedExperienceRecords(page)[0].years,15);
  assert.equal(reviewedExperienceRecords(page)[0].competingClaims.length,2);
  assert.equal(reviewedExperienceRecords({...page,checkedAt:'2026-10-02'}).length,0);
  assert.equal(reviewedExperienceRecords({...page,experienceCandidates:[claim,{...other,nameAsReported:'Someone else'}]}).length,0);
  assert.equal(reviewedExperienceRecords({...page,experienceCandidates:[claim,{...other,sourceKind:claim.sourceKind}]}).length,0);
});
test('career scope review is bound to source content and an existing claim',()=>{
  const url='https://hospital.org/doctor',page={url,sha256:'original',experienceCandidates:[{profileUrl:url,years:24,lowerBound:true,asReported:'24 years overall'},{profileUrl:url,years:10,lowerBound:false,asReported:'10 years specialist'}]};
  const reviews=[{url,sha256:'original',years:24,lowerBound:true,checkedAt:'2026-09-30',basis:'Overall includes specialty tenure'}];
  assert.equal(reviewedExperienceRecords(page,reviews)[0].years,24);
  assert.equal(reviewedExperienceRecords({...page,sha256:'changed'},reviews).length,0);
  assert.equal(reviewedExperienceRecords(page,[{...reviews[0],years:30}]).length,0);
  assert.equal(reviewedExperienceRecords(page,[]).length,0);
});
test('explicit reviewed claim can prefer overall biography without inventing a claim',()=>{
  const url='https://hospital.org/doctor';
  const header={profileUrl:url,nameAsReported:'Doctor',years:12,lowerBound:true,sourceLocator:'Header',asReported:'12+ years',sourceKind:'HOSPITAL_EXPERIENCE_FIELD'};
  const biography={...header,years:24,sourceLocator:'About',asReported:'24+ years treating patients',sourceKind:'HOSPITAL_BIOGRAPHY'};
  const selectedClaim={years:24,lowerBound:true,sourceLocator:'About'};
  const page={url,checkedAt:'2026-10-01',sourcePriorityReview:{checkedAt:'2026-10-01',basis:'Overall career scope corroborated by qualification timeline',selectedClaim},experienceCandidates:[header,biography]};
  assert.equal(reviewedExperienceRecords(page)[0].years,24);
  assert.equal(reviewedExperienceRecords(page)[0].competingClaims.length,2);
  assert.equal(reviewedExperienceRecords({...page,sourcePriorityReview:{...page.sourcePriorityReview,selectedClaim:{...selectedClaim,years:30}}}).length,0);
  assert.equal(reviewedExperienceRecords({...page,experienceCandidates:[header,biography,{...biography}]}).length,0);
  assert.equal(reviewedExperienceRecords({...page,checkedAt:'2026-10-02'}).length,0);
});
test('compatible exact and lower-bound statements retain one doctor observation',()=>{
  const r={nameAsReported:'Doctor',profileUrl:'https://hospital.org/doctor',years:14,asReported:'14 years'};
  const plus={...r,lowerBound:true,asReported:'Over 14 years'};
  assert.deepEqual(consistentReportedAmounts([r,plus]),[{...plus,supportingClaims:['14 years','Over 14 years']}]);
  assert.equal(consistentReportedAmounts([r,{...plus,years:24}]).length,0);
  assert.equal(consistentReportedAmounts([r,{...plus,profileUrl:'https://hospital.org/other'}]).length,0);
  assert.equal(consistentReportedAmounts([r,{...plus,nameAsReported:'Other'}]).length,0);
});
test('hospital-reported experience populates every band without registry verification',()=>{
  for(const [years,label] of [[35,'Trailblazers'],[34,'Trendsetters'],[25,'Trendsetters'],[24,'Rising Stars'],[18,'Rising Stars'],[17,'Frontline Fair'],[10,'Frontline Fair'],[9,'Early Sparks'],[0,'Early Sparks']]){
    const p={id:'one',footprints:[{type:'INSTITUTION',url:'https://hospital.org/doctor'}]};
    const [enriched]=attachReportedExperience([p],[{hcpId:'one',years,profileUrl:p.footprints[0].url,sourceUrl:'https://hospital.org/doctors',publisher:'Hospital',checkedAt:'2026-09-30'}]);
    const [persona]=buildPersonas([enriched]);
    assert.equal(persona.persona,label);assert.equal(enriched.tier,label);assert.equal(persona.classificationStatus,'HOSPITAL_REPORTED');
    assert.equal(persona.registryVerified,undefined);assert.equal(p.experience,undefined);
  }
});
test('reported experience keeps conflicts and unsupported bounds out of assigned tiers',()=>{
  const p={id:'one',footprints:[{type:'INSTITUTION',url:'https://hospital.org/doctor'}]};
  const row={hcpId:'one',years:12,profileUrl:p.footprints[0].url,sourceUrl:'https://hospital.org',checkedAt:'2026-09-30'};
  assert.equal(attachReportedExperience([p],[row,{...row,years:35}])[0].experienceReview,'CONFLICTING_REPORTED_EXPERIENCE');
  assert.equal(attachReportedExperience([p],[{...row,profileUrl:'https://hospital.org/other'}])[0].experience,undefined);
  for(const range of [{minYears:20,maxYears:null},{minYears:17,maxYears:20},{minYears:-1,maxYears:3}])assert.equal(classifyExperience({experience:{...range,url:row.sourceUrl,observedOn:row.checkedAt}}),null);
  assert.equal(classifyExperience({experience:{minYears:35,maxYears:null,url:row.sourceUrl,observedOn:row.checkedAt}}).label,'Trailblazers');
  const [minimum]=attachReportedExperience([p],[{...row,years:30,lowerBound:true}]);
  assert.equal(classifyExperience(minimum).label,'Trendsetters');
  assert.equal(minimum.experience.maxYears,null);assert.match(minimum.experience.label,/30\+/);
  assert.match(minimum.experience.basis,/higher band/);
});
test('experience provenance and reviewed scope survive profile enrichment',()=>{
  const profileUrl='https://hospital.org/doctor';
  const scopeReview={checkedAt:'2026-09-30',basis:'Use 22 years overall, not eight years in the narrower specialty.'};
  const row={hcpId:'one',years:22,lowerBound:true,profileUrl,sourceUrl:profileUrl,publisher:'Hospital',checkedAt:'2026-09-30',asReported:'Over 22 years of practice',sourceLocator:'Biography',sha256:'source-hash',supportingClaims:['22 overall','8 specialty'],scopeReview};
  const [person]=attachReportedExperience([{id:'one',footprints:[{type:'INSTITUTION',url:profileUrl}]}],[row]);
  assert.equal(person.experience.asReported,row.asReported);
  assert.equal(person.experience.sourceHash,row.sha256);
  assert.deepEqual(person.experience.supportingClaims,row.supportingClaims);
  assert.deepEqual(person.experience.scopeReview,scopeReview);
  assert.ok(person.experience.basis.includes(scopeReview.basis));
  assert.equal(classifyExperience(person).label,'Rising Stars');
});
test('pending physician role review blocks imported and registry-derived archetypes',()=>{
  const url='https://hospital.org/educator';
  const hold={url,status:'PHYSICIAN_ROLE_REVIEW_REQUIRED',basis:'Educator role requires qualification review.'};
  const row={hcpId:'one',years:40,profileUrl:url,sourceUrl:url,checkedAt:'2026-09-30'};
  const [p]=attachReportedExperience([{id:'one',footprints:[{type:'INSTITUTION',url}]}],[row],[hold]);
  assert.equal(p.experience,null);
  assert.equal(classifyExperience({...p,experience:{minYears:40,maxYears:40,url,observedOn:'2026-09-30'}}),null);
  const [persona]=buildPersonas([p],[],[{hcp_id:'one',verification_status:'VERIFIED',experience_tier:'Trailblazer',years_of_experience:40}]);
  assert.equal(persona.persona,'Awaiting classification');
});
const exp=years=>({medical_registration_year:2026-years,verification_status:'VERIFIED',registration_source_url:'https://example.org/registry',verified_by:'Registry reviewer',verified_at:'2026-09-28T00:00:00Z'});
test('profile location labels identify the missing field without implying an unverified doctor',()=>{
  for(const p of [{},{city:'Not verified'},{locationsAsReported:['',null,'Unknown'],city:'Not established'}])assert.equal(profileLocationLabel(p),'Location not established');
  assert.equal(profileLocationLabel({city:'Hyderabad'}),'Hyderabad');
  assert.equal(profileLocationLabel({locationsAsReported:[' Pune ','Pune','Mumbai'],city:'Hyderabad'}),'Pune · Mumbai');
});
test('profile statements retain evidence context without converting attribution into clinical verification',()=>{
 const person={id:'one',name:'Clinician',footprints:[]};
 const row={id:'statement',cohortIds:['one'],who:'Dr Clinician',source:'Report',text:'Attributed comment',date:'2026-04',paraphrased:true,clinicalFindingsAppraised:false,attributionType:'NAMED_EXPERT_INPUT',attributionNote:'Publisher-attributed input, not research appraisal',dateBasis:'Issue month only',sourceEvidence:{url:'https://example.org/article',check:'page',sponsorship:'Publisher-disclosed branded content'}};
 const record=buildPersonas([person],[],[],[row])[0].records[0];
 assert.equal(record.sourceCheck,'page');assert.equal(record.paraphrased,true);
 assert.equal(record.clinicalFindingsAppraised,false);assert.equal(record.attributionType,row.attributionType);
 assert.equal(record.attributionNote,row.attributionNote);assert.equal(record.dateBasis,row.dateBasis);
 assert.equal(record.sponsorship,row.sourceEvidence.sponsorship);assert.equal(record.date,'2026-04');
 const unknown=buildPersonas([person],[],[],[{...row,paraphrased:undefined,clinicalFindingsAppraised:undefined,sourceEvidence:{url:row.sourceEvidence.url}}])[0].records[0];
 assert.equal(unknown.sourceCheck,null);assert.equal(unknown.paraphrased,null);
 assert.equal(unknown.clinicalFindingsAppraised,null);assert.equal(unknown.sponsorship,null);
 assert.equal(unknown.publisher,null);
 const published=buildPersonas([person],[],[],[{...row,channel:'News',sourceEvidence:{...row.sourceEvidence,publisher:'Named Publisher'}}])[0].records[0];
 assert.equal(published.publisher,'Named Publisher');assert.equal(published.channel,'News');
 assert.notEqual(unknown.confidence,'VERIFIED');
});
test('five persona names match the agreed taxonomy',()=>assert.deepEqual(personaGroups.map(g=>g.name),['Trailblazers','Trendsetters','Rising Stars','Early Sparks','Frontline Fair']));
test('seniority is independent from posting behaviour',()=>assert.equal(classifyPersona({...exp(35),postsPerMonth:0},now),'Trailblazers'));
test('registration evidence and non-overlapping bands determine tiers',()=>{
  assert.equal(classifyPersona(exp(25),now),'Trendsetters');
  assert.equal(classifyPersona(exp(18),now),'Rising Stars');
  assert.equal(classifyPersona(exp(15),now),'Frontline Fair');
  assert.equal(classifyPersona(exp(9),now),'Early Sparks');
  assert.equal(classifyPersona(exp(10),now),'Frontline Fair');
  assert.equal(classifyPersona({minYears:45,url:'https://example.org/biography'},now),'Awaiting classification');
  assert.equal(classifyPersona({...exp(35),verification_status:'PENDING'},now),'Awaiting classification');
  assert.equal(classifyPersona(null,now),'Awaiting classification');
});
test('literature candidates remain unclassified and works deduplicate',()=>{
  const [p]=buildPersonas([],[{openAlexId:'a1',name:'Candidate',institutions:[],signalClass:'Rising Star',sampleWorks:[{url:'https://example.org/p',title:'One'},{url:'https://example.org/p',title:'One'}]}]);
  assert.equal(p.persona,'Awaiting classification');assert.equal(p.candidate,true);assert.equal(p.records.length,1);assert.equal(inPersonaGroup(p,'review'),true);
});
test('pagination clamps and never exposes unbounded rows',()=>{
  assert.equal(pageItems(Array.from({length:21},(_,i)=>i),0).items.length,6);
  assert.equal(pageItems([1],99).page,0);assert.equal(pageItems([],0).pages,1);
  assert.equal(uniqueRecords([{url:'a'},{url:'a'},{url:'b'}]).length,2);
});
