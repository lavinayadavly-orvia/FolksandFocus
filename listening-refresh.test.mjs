import test from 'node:test';
import assert from 'node:assert/strict';
import {LISTENING_STATEMENTS,SOURCE_LINKS,sourceLink,sponsorshipDisclosure,statementAttributionLabel} from './listening-evidence.mjs';
import {REFRESH_STATEMENTS,REFRESH_SOURCES} from './listening-refresh.mjs';
import {publicAsset} from './backend/static-assets.mjs';
import {researchProfiles} from './data.mjs';
import {listeningCohort} from './listening-cohort.mjs';
import {publicationInWindow,discoverPhrases,statementFacets} from './listening-analytics.mjs';
import {THEMES,FRAMINGS,SENTIMENTS} from './listening-data.mjs';
test('Rathod hospital commentary resolves once without becoming a social post',()=>{
 const rows=listeningCohort.statements.filter(r=>r.id==='R20261001-NR-WIDAL');
 assert.equal(rows.length,1);
 assert.deepEqual(rows[0].cohortIds,['HCP-cdae1b38eb2571fcf1']);
 assert.equal(rows[0].date,'2026-08-05');
 assert.equal(rows[0].attributionType,'CLINICIAN_AUTHORED_COMMENTARY');
 assert.equal(rows[0].clinicalFindingsAppraised,false);
 assert.equal(listeningCohort.posts.some(p=>p.url==='https://www.nanavatimaxhospital.org/blogs/widal-test'),false);
});
test('Taksande bylined hospital article maps once without inventing native social posts',()=>{
 const rows=listeningCohort.statements.filter(r=>r.id==='R20261001-TAKSANDE-PLAQUE');
 assert.equal(rows.length,1);
 assert.deepEqual(rows[0].cohortIds,['HCP-60e134870279bb09ba']);
 assert.equal(rows[0].date,'2026-08-27');
 assert.equal(rows[0].paraphrased,true);
 assert.equal(rows[0].clinicalFindingsAppraised,false);
 assert.equal(listeningCohort.posts.some(p=>p.hcpId==='HCP-60e134870279bb09ba'),false);
});
test('Khan news explainer maps once to his cohort identity without inventing social activity',()=>{
  const rows=listeningCohort.statements.filter(r=>r.id==='R20261001-TOI-134561101');
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].cohortIds,['HCP-d9455e30d801fb10f5']);
  assert.equal(rows[0].date,'2026-09-29');
  assert.equal(rows[0].attributionType,'CLINICIAN_AUTHORED_COMMENTARY');
  assert.equal(rows[0].clinicalFindingsAppraised,false);
  assert.equal(listeningCohort.posts.some(p=>p.id===rows[0].id),false);
});
test('Tickoo columns preserve first publication dates and share one existing clinician identity',()=>{
  for(const [id,date] of [['R20261001-02','2026-08-06'],['R20261001-03','2026-02-12']]){
    const rows=listeningCohort.statements.filter(r=>r.id===id);
    assert.equal(rows.length,1);
    assert.deepEqual(rows[0].cohortIds,['HCP-f863cb8f164a2d947f']);
    assert.equal(rows[0].date,date);
    assert.equal(rows[0].clinicalFindingsAppraised,false);
    assert.equal(rows[0].statementType,'CLINICAL_EXPERIENCE');
    assert.doesNotMatch(rows[0].text,/50-year|businessman|95 pg|HbA1c/);
    assert.equal(listeningCohort.posts.some(p=>p.id===id),false);
  }
  assert.equal(listeningCohort.accounts.some(a=>a.hcpId==='HCP-f863cb8f164a2d947f'),false);
});
test('BLK-Max linked byline resolves to the existing parent-network cohort identity',()=>{
  const rows=listeningCohort.statements.filter(r=>r.id==='R20261001-01');
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].cohortIds,['HCP-272ce4035850e8e472']);
  assert.equal(rows[0].date,'2026-08-05');
  assert.equal(rows[0].clinicalFindingsAppraised,false);
  assert.equal(rows[0].sourceEvidence.identitySourceUrl,'https://www.blkmaxhospital.com/doctor/rajinder-kumar-singal');
  assert.equal(listeningCohort.accounts.some(a=>a.hcpId==='HCP-272ce4035850e8e472'),false);
  assert.equal(listeningCohort.posts.some(p=>p.id===rows[0].id),false);
});
test('walking commentary maps once to Namrita Singh without creating a social account',()=>{
  const rows=listeningCohort.statements.filter(r=>r.sourceEvidence.url==='https://www.maxhealthcare.in/blogs/benefits-of-morning-walk');
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].cohortIds,['HCP-25263e20b477e0d24e']);
  assert.equal(rows[0].date,'2026-01-05');
  assert.equal(rows[0].clinicalFindingsAppraised,false);
  assert.equal(rows[0].sourceEvidence.identitySourceUrl,'https://www.maxhealthcare.in/doctor/dr-namrita-singh');
  assert.equal(listeningCohort.accounts.some(a=>a.hcpId==='HCP-25263e20b477e0d24e'),false);
  assert.equal(listeningCohort.posts.some(p=>p.id===rows[0].id),false);
});
test('prediabetes commentary resolves to the linked physician without creating a social post',()=>{
  const row=listeningCohort.statements.find(r=>r.id==='R20260930-32');
  assert.deepEqual(row.cohortIds,['HCP-1b0912f4deeea3678b']);
  assert.equal(row.date,'2026-02-17');
  assert.equal(row.clinicalFindingsAppraised,false);
  assert.equal(row.sourceEvidence.url,'https://www.maxhealthcare.in/blogs/what-is-prediabetes');
  assert.equal(row.sourceEvidence.identitySourceUrl,'https://www.maxhealthcare.in/doctor/dr-ashutosh-shukla');
  assert.equal(listeningCohort.posts.some(p=>p.id===row.id),false);
});
test('institutional LinkedIn mention is not a clinician statement or native account',()=>{
  const person=researchProfiles.find(p=>p.id==='HCP-04bbb1db08c6774f58');
  const mention=person.footprints.find(r=>r.id==='REFRESH-AT-LINKEDIN');
  assert.equal(mention.date,null);assert.equal(mention.accessStatus,'PUBLIC_INDEX_READ');
  assert.match(mention.relationship,/Hospital-authored mention/);
  assert.equal(listeningCohort.statements.some(r=>r.sourceEvidence?.url===mention.url),false);
  assert.equal(listeningCohort.accounts.some(a=>a.url===mention.url),false);
});
test('refreshed evidence retains attribution, dates and explicit paraphrase state',()=>{
  assert.equal(LISTENING_STATEMENTS.length,107);
  assert.equal(new Set(LISTENING_STATEMENTS.map(r=>r.id)).size,107);
  for(const row of REFRESH_STATEMENTS){
    assert.ok(row.themes.every(theme=>THEMES.some(t=>t.name===theme)),`Unknown theme on ${row.id}`);
    assert.ok(FRAMINGS.includes(row.framing));assert.ok(SENTIMENTS.includes(row.sentiment));
    assert.equal(row.paraphrased,true);assert.equal(row.clinicalFindingsAppraised,false);
    assert.equal(row.sponsorship,REFRESH_SOURCES[row.source].sponsorship??null);assert.ok(row.sentimentBasis);
    assert.ok(SOURCE_LINKS[row.source].locator);assert.equal(sourceLink(row.source),REFRESH_SOURCES[row.source]);
  }
});
test('translated diabetes article is counted once with its original-language date and checked identity',()=>{
  const rows=listeningCohort.statements.filter(r=>r.sourceEvidence.url.includes('diabetes-india-diet-sugar-impact-and-warning-signs'));
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].cohortIds,['HCP-5dbc88e9da19e001b6']);
  assert.equal(rows[0].date,'2026-01-03');
  assert.equal(rows[0].clinicalFindingsAppraised,false);
  assert.equal(rows[0].sourceEvidence.identitySourceUrl,'https://www.maxhealthcare.in/doctor/dr-vimal-upreti');
});
test('public news additions preserve identities and historical dates without creating native posts',()=>{
  for(const [id,hcp,date] of [['R20260930-28','HCP-03fbdd7027e0ca4a39','2025-10-01'],['R20260930-29','HCP-8fa6877901cf39e5f8','2026-01-04'],['R20260930-30','HCP-4aeea52efb2d0ff191','2026-08-05']]){
    const row=listeningCohort.statements.find(r=>r.id===id);
    assert.deepEqual(row.cohortIds,[hcp]);assert.equal(row.date,date);
    assert.equal(row.clinicalFindingsAppraised,false);assert.equal(row.paraphrased,true);
    assert.equal(publicationInWindow(row,{start:'2025-10-01',end:'2026-09-30'}),true);
    assert.ok(researchProfiles.find(p=>p.id===hcp).footprints.some(f=>f.url===row.sourceEvidence.identitySourceUrl));
    assert.equal(listeningCohort.accounts.some(a=>a.hcpId===hcp),false);
  }
  assert.equal(listeningCohort.statements.filter(r=>r.sourceEvidence.url.includes('preventive-check-up-today-peace-of-mind-tomorrow')).length,1);
  const socialCase=listeningCohort.statements.find(r=>r.id==='R20260930-26');
  assert.deepEqual(socialCase.cohortIds,['HCP-afb3ed344a7ab15048']);
  assert.equal(socialCase.sourceEvidence.check,'page');
  assert.equal(socialCase.date,null);
  assert.equal(publicationInWindow(socialCase,{start:'2025-10-01',end:'2026-09-30'}),false);
  assert.equal(statementAttributionLabel(socialCase),'Public Social Case Discussion');
  assert.doesNotMatch(socialCase.text,/34 years|male|discharged|day|picture/i);
  assert.equal(listeningCohort.accounts.some(a=>a.hcpId===socialCase.cohortIds[0]),false);
  const reflection=listeningCohort.statements.find(r=>r.id==='R20260930-27');
  assert.deepEqual(reflection.cohortIds,['HCP-13d093d4da4dbf55b2']);
  assert.equal(reflection.date,'2026-07-01');
  assert.equal(reflection.statementType,'CLINICAL_EXPERIENCE');
  assert.equal(statementAttributionLabel(reflection),'Attributed Clinical Reflection');
  const caseReport=listeningCohort.statements.find(r=>r.id==='R20260930-25');
  assert.deepEqual(caseReport.cohortIds,['HCP-8af6096ca8828c4958']);
  assert.equal(statementAttributionLabel(caseReport),'Co-Authored Case Report');
  assert.equal(caseReport.clinicalFindingsAppraised,false);
  assert.equal(publicationInWindow(caseReport,{start:'2025-10-01',end:'2026-09-30'}),false);
  const hospitalDescription=listeningCohort.statements.find(r=>r.id==='R20260930-24');
  assert.deepEqual(hospitalDescription.cohortIds,['HCP-7807e10091cf0b765e']);
  assert.equal(hospitalDescription.date,null);
  assert.equal(publicationInWindow(hospitalDescription,{start:'2025-10-01',end:'2026-09-30'}),false);
  assert.match(hospitalDescription.attributionNote,/not a verbatim statement/);
  for(const [id,hcp] of [['R20260930-22','HCP-7807e10091cf0b765e'],['R20260930-23','HCP-e4f7fde23eddc8e8ec']]){
    const row=listeningCohort.statements.find(r=>r.id===id);
    assert.deepEqual(row.cohortIds,[hcp]);assert.equal(row.paraphrased,true);
    assert.equal(publicationInWindow(row,{start:'2025-10-01',end:'2026-09-30'}),true);
    assert.equal(row.sourceEvidence.check,'page');assert.match(row.dateBasis,/update/);
    assert.equal(row.clinicalFindingsAppraised,false);
  }
  assert.doesNotMatch(listeningCohort.statements.find(r=>r.id==='R20260930-23').text,/Ozempic|Wegovy|Mounjaro|pancreatitis|generics/i);
  const release=listeningCohort.statements.find(r=>r.id==='R20260930-21');
  assert.deepEqual(release.cohortIds,['HCP-708a69973d017d6857']);
  assert.equal(release.whoAsReported,'Dr. Bipin Sethi');
  assert.equal(release.roleAsReported,'MD Medicine DM Endocrinology');
  assert.equal(release.date,'2024-09-04');
  assert.match(release.sponsorship,/Sanofi India-supported RSSDI program/);
  assert.match(release.sponsorship,/compensation not established/);
  assert.equal(sponsorshipDisclosure(release.source),release.sponsorship);
  assert.equal(publicationInWindow(release,{start:'2025-10-01',end:'2026-09-30'}),false);
  assert.equal(listeningCohort.accounts.some(a=>a.hcpId===release.cohortIds[0]),false);
  const care=listeningCohort.statements.find(r=>r.id==='R20260930-20');
  assert.deepEqual(care.cohortIds,['HCP-4d7fb675afbe615538']);
  assert.equal(care.date,'2025-05-09');
  assert.equal(care.attributionType,'NAMED_CLINICIAN_CREDIT_IN_HOSPITAL_ARTICLE');
  assert.match(care.text,/article credited to Gupta/);
  assert.match(care.attributionNote,/precise editorial role.*not established/);
  assert.equal(publicationInWindow(care,{start:'2025-10-01',end:'2026-09-30'}),false);
  const aster=listeningCohort.statements.find(r=>r.id==='R20260930-19');
  assert.deepEqual(aster.cohortIds,['HCP-4f9f2a28a5bd559a93']);
  assert.equal(aster.date,'2024-07-19');assert.match(aster.attributionNote,/separate medical-review badge does not establish authorship/);
  assert.equal(publicationInWindow(aster,{start:'2025-10-01',end:'2026-09-30'}),false);
  assert.ok(researchProfiles.find(p=>p.id===aster.cohortIds[0]).footprints.some(f=>f.url===aster.sourceEvidence.identitySourceUrl));
  const kauvery=listeningCohort.statements.find(r=>r.id==='R20260930-18');
  assert.deepEqual(kauvery.cohortIds,['HCP-203345361b31313c2f']);
  assert.equal(kauvery.whoAsReported,'Dr. Ashwin Subramaniam');
  assert.equal(kauvery.date,null);assert.equal(kauvery.sourceEvidence.check,'page');
  assert.equal(publicationInWindow(kauvery,{start:'2025-10-01',end:'2026-09-30'}),false);
  assert.equal(publicationInWindow(kauvery,{start:'2025-10-01',end:'2026-09-30',includeUndated:true}),true);
  assert.ok(researchProfiles.find(p=>p.id===kauvery.cohortIds[0]).footprints.some(f=>f.url===kauvery.sourceEvidence.identitySourceUrl));
  const physician=listeningCohort.statements.find(r=>r.id==='R20260930-17');
  assert.deepEqual(physician.cohortIds,['HCP-c4708883b43dbd8045']);
  assert.equal(physician.specialty,'Internal Medicine');assert.equal(physician.date,'2026-04');
  assert.match(physician.text,/common-cold/);assert.doesNotMatch(physician.text,/obesity|cancer/i);
  const weekly=listeningCohort.statements.find(r=>r.id==='R20260930-15');
  assert.deepEqual(weekly.cohortIds,['HCP-b7b0eb6fe0c73ffd86']);
  assert.equal(weekly.sourceEvidence.check,'index');
  assert.deepEqual(statementFacets(weekly).brand,['Awiqli']);
  assert.deepEqual(statementFacets(weekly).molecule,['Insulin icodec']);
  assert.deepEqual(statementFacets({text:'Insulin icodec'}).brand,['Unspecified brand']);
  const newsletter=listeningCohort.statements.find(r=>r.id==='R20260930-16');
  assert.deepEqual(newsletter.cohortIds,['HCP-2166915f3e67f4877b']);
  assert.equal(newsletter.date,'2026-04');assert.equal(newsletter.sourceEvidence.check,'page');
  assert.equal(publicationInWindow(newsletter,{start:'2026-04-01',end:'2026-04-30'}),true);
  assert.equal(publicationInWindow(newsletter,{start:'2026-04-15',end:'2026-04-30'}),false);
  const undated=listeningCohort.statements.find(r=>r.id==='R20260930-14');
  assert.deepEqual(undated?.cohortIds,['HCP-f103511d7be987c90d']);
  assert.equal(undated.date,null);
  assert.equal(publicationInWindow(undated,{start:'2025-10-01',end:'2026-09-30'}),false);
  assert.equal(listeningCohort.accounts.some(a=>a.hcpId===undated.cohortIds[0]),false);
  const candidates=researchProfiles.find(p=>p.id===undated.cohortIds[0]).footprints.filter(r=>r.id.startsWith('REFRESH-DCR-'));
  assert.equal(candidates.length,3);
  assert.ok(candidates.every(r=>r.confidence==='UNVERIFIED'&&r.date===null&&r.discoverySourceUrl));
  for(const id of ['R20260930-12','R20260930-13']){
    const row=listeningCohort.statements.find(r=>r.id===id);
    assert.deepEqual(row?.cohortIds,['HCP-597b19bbed913c25ae']);
    assert.equal(row.sourceEvidence.check,'page');
    assert.match(row.dateBasis,/original publication versus revision not established/);
  }
  const indexed=listeningCohort.statements.find(r=>r.id==='R20260930-11');
  assert.deepEqual(indexed?.cohortIds,['HCP-ab9298d8c5cb95a939']);
  assert.equal(indexed.sourceEvidence.check,'index');
  assert.equal(indexed.reviewStatus,'INDEX_ATTRIBUTION_CHECKED');
  assert.match(indexed.attributionNote,/account ownership.*not verified/);
  const branded=listeningCohort.statements.find(r=>r.id==='R20260930-10');
  assert.deepEqual(branded?.cohortIds,['HCP-85b9dbcd151eae5ca0']);
  assert.match(branded.sponsorship,/Branded content disclosed/);
  assert.match(branded.attributionNote,/payment.*not established/);
  for(const [statementId,cohortId] of [['R20260930-06','HCP-a9348e15ec9645f176'],['R20260930-07','HCP-6255616bef7183338d'],['R20260930-08','HCP-8694ab63389c9b76c6'],['R20260930-09','HCP-01ffed4be6b53e2f10']]){
    const row=listeningCohort.statements.find(r=>r.id===statementId);
    assert.deepEqual(row?.cohortIds,[cohortId]);
    assert.ok(row.attributionType);assert.equal(row.clinicalFindingsAppraised,false);
  }
  const historic=listeningCohort.statements.find(r=>r.id==='R20260930-08');
  assert.equal(publicationInWindow(historic,{start:'2025-10-01',end:'2026-09-30'}),false);
  assert.ok(listeningCohort.posts.every(p=>!Object.values(REFRESH_SOURCES).some(s=>s.url===p.url)));
});
test('browser can load refreshed source modules',()=>{
  for(const asset of ['listening-evidence.mjs','listening-refresh.mjs'])assert.equal(publicAsset('/'+asset),asset);
});
test('visible attribution labels distinguish article credit from authorship without guessing missing roles',()=>{
 assert.equal(statementAttributionLabel({attributionType:'NAMED_CLINICIAN_CREDIT_IN_HOSPITAL_ARTICLE'}),'Hospital Article: Clinician Credit');
 assert.equal(statementAttributionLabel({attributionType:'CLINICIAN_AUTHORED_COMMENTARY'}),'Clinician-Authored Commentary');
 assert.equal(statementAttributionLabel({attributionType:'SEARCH_INDEXED_AUTHOR_ATTRIBUTION'}),'Search-Indexed Author Attribution');
 for(const row of [null,{}, {attributionType:'UNKNOWN'}, {attributionType:'constructor'}])assert.equal(statementAttributionLabel(row),null);
});
test('source disclosure is shared across views and never infers sponsorship from a publisher name',()=>{
  const branded=REFRESH_STATEMENTS.find(r=>r.id==='R20260930-10');
  assert.equal(sponsorshipDisclosure(branded),branded.sponsorship);
  assert.equal(sponsorshipDisclosure(branded.source),branded.sponsorship);
  assert.equal(sponsorshipDisclosure({source:branded.source}),branded.sponsorship);
  assert.equal(sponsorshipDisclosure({publisher:'HT Brand Studio'}),'');
  assert.equal(sponsorshipDisclosure({sponsorship:null}),'');
  assert.equal(sponsorshipDisclosure(null),'');
});
test('evidence caveats stay outside the clinical topic extraction text',()=>{
  for(const row of REFRESH_STATEMENTS){
    assert.ok(row.attributionNote);
    assert.doesNotMatch(row.text,/social post|independently appraised|expert-input credit/i);
  }
  const names=discoverPhrases(REFRESH_STATEMENTS,1).map(p=>p.name).join(' ');
  assert.doesNotMatch(names,/social post|independently appraised|clinician authorship/i);
});
test('organisational mentions and undated media do not become clinician posts',()=>{
  const mention=researchProfiles.flatMap(p=>p.footprints).find(r=>r.id==='REFRESH-PC-LINKEDIN');
  assert.equal(mention.date,null);assert.equal(mention.eventDate,'2026-04-04');
  assert.match(mention.relationship,/not a clinician-authored post/);
  assert.ok(listeningCohort.posts.every(p=>p.url!==mention.url));
});
test('medical review and metadata authorship preserve separate roles without duplicating an article',()=>{
  const rows=REFRESH_STATEMENTS.filter(r=>r.id==='R20261001-04');
  assert.equal(rows.length,1);
  const source=REFRESH_SOURCES[rows[0].source];
  assert.deepEqual(source.contributorEvidence.map(r=>r.role),['MEDICAL_REVIEWER','AUTHOR']);
  assert.equal(source.identityReview.cohortId,'HCP-119ce4a9afa8d4d86f');
  assert.match(rows[0].attributionNote,/metadata/);
  assert.equal(rows[0].date,'2026-08-13');
  assert.equal(rows[0].clinicalFindingsAppraised,false);
});
test('Manipal reviewer and metadata author resolve to one existing clinician',()=>{
  const rows=REFRESH_STATEMENTS.filter(r=>r.id==='R20261001-06');
  assert.equal(rows.length,1);
  const source=REFRESH_SOURCES[rows[0].source];
  assert.deepEqual(source.contributorEvidence.map(r=>r.role),['MEDICAL_REVIEWER','AUTHOR']);
  assert.equal(source.identityReview.cohortId,'HCP-1a75e1b4e15cdad28b');
  assert.equal(rows[0].date,'2026-06-10');
  assert.equal(rows[0].clinicalFindingsAppraised,false);
});
test('publication dates retain their precision under period filtering',()=>{
  const window={start:'2025-10-01',end:'2026-09-30'};
  assert.equal(publicationInWindow({date:'2026-04'},window),true);
  assert.equal(publicationInWindow({date:'2026'},window),false);
  assert.equal(publicationInWindow({date:null},window),false);
  assert.equal(publicationInWindow({date:'2026-09'},{start:'2026-09-15',end:'2026-09-30'}),false);
  assert.equal(publicationInWindow({date:null},window,true),true);
});
