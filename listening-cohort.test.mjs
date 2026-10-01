import test from 'node:test';
import assert from 'node:assert/strict';
import {listeningCohort,reconcileListening} from './listening-cohort.mjs';
import {researchProfiles} from './data.mjs';
import {onRequest} from './functions/api/[[path]].js';
import {buildPersonas} from './persona-model.mjs';
import {guardStatements,statementSourceKey} from './statement-quality.mjs';
test('different import IDs for one sourced statement count once, without collapsing meaningful URL parameters',()=>{
 const a={id:'a',who:'Doctor One',role:'Hospital A',specialty:'Cardiology',date:'2026-01-01',text:'An attributed observation.',sentiment:'Positive',sourceEvidence:{url:'https://example.test/article?id=1&utm_source=x#section'}};
 const b={...a,id:'b',sourceEvidence:{url:'https://example.test/article?id=1'}};
 for(const input of [[a,b],[b,a]]){
  const result=guardStatements(input);
  assert.deepEqual(result.statements.map(r=>r.id),['a']);
  assert.equal(result.duplicates[0].canonicalId,'a');
 }
 assert.equal(guardStatements([a,{...b,sourceEvidence:{url:'https://example.test/article?id=2'}}]).statements.length,2);
 assert.equal(statementSourceKey('javascript:alert(1)'),null);
 assert.equal(guardStatements([a,{...b,sentiment:'Negative'}]).statements.length,0);
 assert.equal(guardStatements([a,{...a,text:'Conflicting version'},b]).statements.length,0);
});
test('identical longer commentary at different publishers stays visible and is flagged for review',()=>{
 const a={id:'a',who:'Doctor One',role:'Hospital A',specialty:'Cardiology',date:'2026-01-01',text:'This sufficiently long attributed statement must not automatically become a single event across different publishers.',sourceEvidence:{url:'https://one.test/article'}};
 const b={...a,id:'b',sourceEvidence:{url:'https://two.test/article'}};
 const result=guardStatements([a,b]);
 assert.equal(result.statements.length,2);
 assert.equal(result.possibleDuplicates.length,1);
 assert.deepEqual(result.possibleDuplicates[0].records.map(r=>r.id),['a','b']);
 assert.equal(guardStatements([a,{...b,date:'2026-02-01'}]).possibleDuplicates.length,0);
});
test('undated same-source imports count once without inferring dates or merging different speakers',()=>{
 const a={id:'a',who:'Doctor One',role:'Hospital A',specialty:'Cardiology',date:null,text:'An attributed observation with no established publication date.',sentiment:'Positive',sourceEvidence:{url:'https://example.test/article'}};
 const b={...a,id:'b',sourceEvidence:{url:'https://example.test/article?utm_source=feed'}};
 for(const input of [[a,b],[b,a]]){
  const result=guardStatements(input);
  assert.deepEqual(result.statements.map(r=>r.id),['a']);
  assert.equal(result.statements[0].date,null);
  assert.equal(result.duplicates[0].reason,'SAME_SOURCE_STATEMENT_COPY');
 }
 assert.equal(guardStatements([a,{...b,who:'Doctor Two'}]).statements.length,2);
 assert.equal(guardStatements([a,{...b,date:'2026-01-01'}]).statements.length,2);
 assert.equal(guardStatements([a,{...b,text:'A separate observation.'}]).statements.length,2);
});
test('undated conflicting classifications and copies of conflicting IDs are withheld',()=>{
 const a={id:'a',who:'Doctor One',date:null,text:'An attributed observation.',sentiment:'Positive',sourceEvidence:{url:'https://example.test/article'}};
 const b={...a,id:'b'};
 for(const input of [[a,{...b,sentiment:'Negative'}],[{...b,sentiment:'Negative'},a]]){
  const result=guardStatements(input);
  assert.equal(result.statements.length,0);
  assert.ok(result.review.every(r=>r.reason==='CONFLICTING_STATEMENT_CLASSIFICATION'));
 }
 assert.equal(guardStatements([a,{...a,text:'Conflicting version'},b]).statements.length,0);
});
test('undated matching text across publishers is flagged without automatic syndication assumptions',()=>{
 const a={id:'a',who:'Doctor One',date:null,text:'This sufficiently long attributed statement may be syndicated, but the relationship has not been established.',sourceEvidence:{url:'https://one.test/article'}};
 const b={...a,id:'b',sourceEvidence:{url:'https://two.test/article'}};
 const result=guardStatements([a,b]);
 assert.equal(result.statements.length,2);
 assert.equal(result.possibleDuplicates.length,1);
 assert.ok(result.statements.every(r=>r.date===null));
});
test('statement deduplication is independent of object key order and holds every conflicting version',()=>{
 const a={id:'one',text:'A',date:'2026-01-01'};
 const b={date:'2026-01-01',text:'A',id:'one'};
 assert.equal(guardStatements([a,b]).statements.length,1);
 assert.equal(guardStatements([{...a,checkedAt:'2026-09-29',themes:['A','B']},{...a,checkedAt:'2026-09-30',themes:['B','A']}]).statements.length,1);
 for(const input of [[a,b,{...a,text:'B'}],[{...a,text:'B'},a,b]]){
  const result=guardStatements(input);
  assert.equal(result.statements.length,0);
  assert.deepEqual(result.conflicts,['one']);
  assert.equal(result.duplicates.length,0);
 }
 assert.equal(guardStatements([{}]).review[0].reason,'MISSING_STATEMENT_ID');
});
test('shared reconciliation cannot double count repeated imports or pick a conflicting statement',()=>{
 const p={id:'one',name:'Same Name',aliases:[],affiliation:'Hospital A',specialties:['Endocrinology'],footprints:[],locationsAsReported:[]};
 const row={id:'s',who:'Dr Same Name',role:'Hospital A',specialty:'Endocrinology',source:'s',date:'2026-01-01',text:'A'};
 const sources={s:{url:'https://example.test/source'}};
 const repeated=reconcileListening([p],[row,{...row}],sources);
 assert.equal(repeated.statements.length,1);
 assert.deepEqual(repeated.doctors[0].statementIds,['s']);
 const conflict=reconcileListening([p],[row,{...row,text:'B'}],sources);
 assert.equal(conflict.statements.length,0);
 assert.equal(conflict.statementQuality.review[0].reason,'CONFLICTING_STATEMENT_ID');
});
test('clinical and listening APIs share exactly the same active IDs',async()=>{
 const read=async path=>(await onRequest({request:new Request(`https://example.test/api/${path}`),params:{path}})).json();
 const clinical=await read('research'),listening=await read('listening-cohort');
 assert.equal(clinical.items.length,2023);assert.equal(listening.cohortTotal,2023);
 assert.deepEqual(new Set(clinical.items.map(p=>p.id)),new Set(listening.doctors.map(p=>p.id)));
 assert.equal(Object.values(listening.counts).reduce((a,b)=>a+b,0),2023);
});
test('captured activity maps only to corroborated cohort identities',()=>{
 assert.equal(listeningCohort.counts.ACTIVITY_CAPTURED,37);
 assert.equal(listeningCohort.counts.NOT_ESTABLISHED,1983);
 const linked=listeningCohort.doctors.find(p=>p.name==='Ambrish Mithal');
 assert.equal(linked.activities,4);
 assert.equal(linked.statementIds.length,6);
 assert.ok(listeningCohort.resolutions.filter(r=>r.cohortId).every(r=>r.sourceUrl&&r.profileSourceUrls.length));
});
test('name-only overlaps remain unresolved and do not imply inactivity',()=>{
 const p={id:'one',name:'Same Name',aliases:[],affiliation:'Hospital A',specialties:['Endocrinology'],footprints:[],locationsAsReported:[]};
 const rows=[{id:'s',who:'Dr Same Name',role:'Hospital B',specialty:'Endocrinology',source:'s',date:'2026-01-01'}];
 const result=reconcileListening([p],rows,{s:{url:'https://example.test/source'}});
 assert.equal(result.statements.length,0);assert.equal(result.doctors[0].status,'NOT_ESTABLISHED');
 assert.equal(result.doctors[0].inactive,undefined);
});
test('institution matching respects word boundaries and accepts formatting variants, not incidental substrings',()=>{
 const p={id:'one',name:'Same Name',aliases:[],affiliation:'CARE',specialties:['General Medicine'],footprints:[],locationsAsReported:[]};
 const row={id:'s',who:'Dr Same Name',role:'Consultant, Max Healthcare',specialty:'Internal Medicine',source:'s',date:'2026-09-01'};
 const links={s:{url:'https://example.test/source'}};
 const run=(person,statement)=>reconcileListening([person],[statement],links).statements.length;
 assert.equal(run(p,row),0);
 assert.equal(run(p,{...row,role:'Consultant, CARE'}),1);
 assert.equal(run({...p,affiliation:'CARE Hospitals'},{...row,role:'Consultant - CARE Hospital'}),1);
 assert.equal(run({...p,affiliation:'Hospital A'},{...row,role:'Hospital ABC'}),0);
 assert.equal(run({...p,affiliation:'Hospital A'},{...row,role:'Hospital-A'}),1);
 assert.equal(run(p,{...row,role:'CARE',specialty:'Veterinary Internal Medicine'}),0);
 assert.equal(run(p,{...row,role:null}),0);
 assert.equal(run(p,{...row,role:'CARE',specialty:null}),0);
 assert.equal(run({...p,specialties:['Cardiology']},{...row,role:'CARE',specialty:'Echocardiology'}),0);
});
test('cross-institution review requires matching name, specialty and an exact cohort profile source',()=>{
 const p={id:'one',name:'Same Name',aliases:[],affiliation:'Hospital A',specialties:['Endocrinology'],footprints:[{type:'INSTITUTION',url:'https://hospital.test/doctor'}],locationsAsReported:[]};
 const row={id:'s',who:'Dr Same Name',role:'Clinic B',specialty:'Endocrinology',source:'s',date:null};
 const review={status:'REVIEWED',cohortId:'one',profileSourceUrl:'https://hospital.test/doctor',checkedAt:'2026-09-30',basis:'Matched professional training across institutional and clinic biographies',corroboratingSourceUrls:['https://clinic.test/doctor','https://doctor.test/']};
 const run=(r,person=p,statement=row)=>reconcileListening([person],[statement],{s:{url:'https://doctor.test/article',identityReview:r}});
 assert.equal(run(review).statements.length,1);
 for(const change of [{status:'PENDING'},{cohortId:'other'},{profileSourceUrl:'https://unrelated.test/'},{basis:''},{checkedAt:null},{corroboratingSourceUrls:[]}])assert.equal(run({...review,...change}).statements.length,0);
 assert.equal(run(review,p,{...row,specialty:'Cardiology'}).statements.length,0);
 assert.equal(run(review,p,{...row,who:'Dr Different Name'}).statements.length,0);
 assert.equal(run(review,{...p,footprints:[]}).statements.length,0);
});
test('clinical profile and listening report agree on captured activity',()=>{
 const p=buildPersonas(researchProfiles,[],[],listeningCohort.statements).find(p=>p.listeningActivities);
 assert.equal(p.listeningActivities,listeningCohort.doctors.find(d=>d.id===p.id).activities);
 assert.equal(p.records.filter(r=>r.type==='LISTENING').length,listeningCohort.statements.filter(r=>r.cohortIds.includes(p.id)).length);
 assert.equal(p.persona,listeningCohort.doctors.find(d=>d.id===p.id).archetype);
});
test('social monitor returns only canonical cohort-linked accounts',async()=>{
 const result=await (await onRequest({request:new Request('https://example.test/api/social-monitor'),params:{path:'social-monitor'}})).json();
 assert.equal(result.accounts.length,4);assert.equal(result.posts.length,2);
 const ajith=result.posts.find(p=>p.id==='linkedin-7166969331740819456');
 assert.equal(ajith.hcpId,'HCP-108852fabdfd6a50c6');
 assert.equal(ajith.postType,'POST');
 assert.equal(ajith.publishedAt,null);
 assert.equal(ajith.sentiment,null);
 assert.equal(ajith.contentType,'PARAPHRASE');
 assert.ok(Object.values(ajith.metrics).every(value=>value===null));
 assert.equal(result.posts.filter(p=>p.url===ajith.url).length,1);
 const post=result.posts.find(p=>p.id==='linkedin-7461349090468077569');
 assert.equal(post.hcpId,'HCP-9a8d00dbd2b616ba33');
 assert.equal(post.publishedAt,null);
 assert.equal(post.sentiment,null);
 assert.equal(post.contentType,'PARAPHRASE');
 assert.ok(Object.values(post.metrics).every(value=>value===null));
 const gagan=result.accounts.find(a=>a.hcpId==='HCP-6ec514c5ecd9490363');
 assert.equal(gagan.platform,'LinkedIn');
 assert.equal(gagan.identityEvidence.matchedFields.length,5);
 assert.equal(gagan.postCount,0);
 assert.ok(result.accounts.every(a=>researchProfiles.some(p=>p.id===a.hcpId)));
});
