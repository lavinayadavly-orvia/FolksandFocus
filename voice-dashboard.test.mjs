import test from 'node:test';
import {researchProfiles} from './data.mjs';
import {individualLocationReviews} from './location-reviews.mjs';
test('reviewed cohort geography is complete and counts reconcile without duplicated doctors',()=>{
 const people=visibleProfileCohort(buildPersonas(researchProfiles));
 const d=geographyCuts(people);
 assert.equal(d.total,1060);
 assert.equal(d.unresolved,0);
 assert.equal(d.rows.filter(r=>r.city==='City Unresolved').length,0);
 assert.equal(d.mapped+d.multiState,d.total);
 assert.equal(new Set(individualLocationReviews.map(r=>r.profileUrl)).size,individualLocationReviews.length);
 for(const review of individualLocationReviews){
  assert.ok(review.checkedAt);assert.ok(review.locator);
  for(const city of review.locations)assert.notEqual(locateDoctor({city}).city,'City Unresolved');
 }
});
import {geographyCuts,locateDoctor,applyReviewedGeography} from './geography.mjs';
test('reviewed current practice replaces stale city and preserves multiple practice locations',()=>{
 const p=applyReviewedGeography({id:'pandey',city:'New Delhi',locationsAsReported:['New Delhi'],footprints:[{url:'https://www.maxhealthcare.in/doctor/dr-amrendra-kumar-pandey'}]});
 assert.equal(p.city,'Ghaziabad');assert.deepEqual(p.locationsAsReported,['New Delhi']);
 const multi=applyReviewedGeography({id:'das',footprints:[{url:'https://www.maxhealthcare.in/doctor/dr-arvind-m-das'}]});
 assert.deepEqual(multi.practiceLocations,['New Delhi','Gurugram']);
 const d=geographyCuts([p,multi,{id:'pending'}]);
 assert.equal(d.mapped,1);assert.equal(d.located,2);assert.equal(d.multiState,1);assert.equal(d.unresolved,1);
 assert.equal(d.mapped+d.multiState+d.unresolved,d.total);
});
test('branch review is institution scoped and new location modules are served',()=>{
 for(const [affiliation,city] of [['KIMS Hospitals, Kondapur','Hyderabad'],['CARE Hospitals, Health City, Arilova','Visakhapatnam'],['Medicover Hospitals, Chandanagar','Hyderabad']]){
  const p=applyReviewedGeography({affiliation});assert.equal(p.city,city);assert.ok(p.geographyEvidence.sourceUrl);
 }
 assert.equal(locateDoctor({affiliation:'Other Hospital, Kondapur'}).state,'Location Unresolved');
 for(const module of ['geography.mjs','geography-ui.mjs','location-reviews.mjs'])assert.equal(publicAsset('/'+module),module);
});
test('hospital branch geography reaches profiles and keeps NCR separate from state',()=>{
 const pandey=applyReviewedGeography({affiliation:'Max Healthcare',footprints:[{url:'https://www.maxhealthcare.in/doctor/dr-amrendra-kumar-pandey'}]});
 assert.equal(pandey.city,'Ghaziabad');assert.equal(pandey.state,'Uttar Pradesh');assert.equal(pandey.region,'Delhi NCR');assert.equal(pandey.geographyEvidence.sourceUrl,'https://dramrendrapandey.com/');
 const ajay=applyReviewedGeography({affiliation:'Max Healthcare',footprints:[{url:'https://www.maxhealthcare.in/doctor/dr-ajay-k-sharma'}]});
 assert.equal(ajay.city,'Noida');assert.equal(ajay.state,'Uttar Pradesh');assert.equal(ajay.region,'Delhi NCR');assert.ok(ajay.geographyEvidence.sourceUrl);
 assert.equal(locateDoctor({affiliation:'Medicover Hospitals, Financial District'}).city,'Hyderabad');
 assert.equal(locateDoctor({affiliation:'Other Hospital, Financial District'}).city,'City Unresolved');
 assert.equal(locateDoctor({footprints:[{type:'INSTITUTION',url:'https://www.kauveryhospital.com/doctors/chennai-radial-road/interventional-cardiology/prof-dr-ajith-pillai/'}]}).city,'Chennai');
});
test('geographic allocation normalizes explicit cities without duplicate or NCR inflation',()=>{
 assert.deepEqual(locateDoctor({locationsAsReported:['Ghaziabad - Delhi NCR']}),{state:'Uttar Pradesh',city:'Ghaziabad'});
 assert.equal(locateDoctor({locationsAsReported:['navi-mumbai']}).city,'Navi Mumbai');
 assert.equal(locateDoctor({affiliation:'Aster CMI Bangalore'}).city,'Bengaluru');
 assert.equal(locateDoctor({affiliation:'Manipal Hospitals',locationsAsReported:['Pune']}).state,'Maharashtra');
 assert.equal(locateDoctor({affiliation:'Manipal Hospitals',locationsAsReported:['Dwarka - Delhi NCR']}).state,'Delhi');
 assert.equal(locateDoctor({locationsAsReported:['Gurugram - Delhi NCR']}).state,'Haryana');
 assert.equal(locateDoctor({affiliation:'Max Healthcare',footprints:[{url:'https://www.maxhealthcare.in/doctor/dr-ambrish-mithal'}]}).state,'Multiple States');
 assert.equal(locateDoctor({locationsAsReported:['Kondapur']}).state,'Location Unresolved');
 assert.equal(locateDoctor({locationsAsReported:['Mumbai','Pune']}).city,'Multiple Cities');
 assert.equal(locateDoctor({locationsAsReported:['Mumbai','Bengaluru']}).state,'Multiple States');
 const people=[{id:'a',locationsAsReported:['Bengaluru']},{id:'b',locationsAsReported:['Goa']},{id:'c'}];
 const d=geographyCuts([...people,people[0]]);
 assert.equal(d.total,3);assert.equal(d.mapped,2);assert.equal(d.unresolved,1);
 assert.equal(d.states.reduce((n,s)=>n+s.cities.reduce((a,c)=>a+c.count,0),0),d.mapped);
});
import assert from 'node:assert/strict';
import {voiceDashboard,wordTokens,clinicalWordMatches,analyticsCuts} from './voice-dashboard.mjs';
import {publicAsset} from './backend/static-assets.mjs';
import {buildPersonas,visibleProfileCohort} from './persona-model.mjs';
import {reconcileListening} from './listening-cohort.mjs';
const people=[{id:'a',name:'Doctor Alpha',persona:'Trendsetters'},{id:'b',name:'Doctor Beta',persona:'Awaiting classification'}];
const row={id:'one',cohortIds:['a'],date:'2026-09-01',sourceEvidence:{url:'https://example.org/article'},text:'GLP-1 safety safety and T2DM.',themes:['Safety'],sentiment:'Positive'};
const now=new Date('2026-09-30T00:00:00Z');
test('visible cohort excludes deferred and candidate profiles without deleting the source array',()=>{
 const source=[...people,{id:'candidate',persona:'Trendsetters',candidate:true}];
 assert.deepEqual(visibleProfileCohort(source).map(p=>p.id),['a']);
 assert.equal(source.length,3);
 const d=analyticsCuts(visibleProfileCohort(source),[row,{...row,id:'deferred',cohortIds:['b']}],{now});
 assert.equal(d.members.length,1);assert.equal(d.rows.length,1);
});
test('clinical cloud preserves meaningful phrases and excludes generic narrative words',()=>{
 const terms=clinicalWordMatches('The doctor strongly says appropriate important things about heart failure, Type 2 diabetes, CKD, weight loss and medical supervision.');
 assert.deepEqual(terms.map(t=>t.label).sort(),['Heart Failure','Type 2 Diabetes','Chronic Kidney Disease','Weight Loss','Medical Supervision'].sort());
 assert.equal(terms.some(t=>t.word==='diabetes'),false);
 assert.equal(clinicalWordMatches('A doctor from New Delhi says these things.').length,0);
 const d=voiceDashboard(people,[{...row,text:'Heart failure and heart failure; muscle loss.',themes:[]}],{now});
 assert.equal(d.words.find(w=>w.word==='heart failure').instances,2);
 assert.deepEqual(d.words.find(w=>w.word==='heart failure').statementIds,['one']);
 assert.equal(d.words.some(w=>w.word==='failure'),false);
});
test('analytics cuts reconcile source statements without inventing dates or double-counting shared specialties',()=>{
 const doctors=people.map(p=>({...p,specialty:'Cardiology'}));
 const first={...row,cohortIds:['a','b'],channel:'Hospital Blog'};
 const second={...row,id:'undated',date:null,channel:'LinkedIn'};
 const d=analyticsCuts(doctors,[first,second],{period:'all',now});
 assert.equal(d.specialties[0].count,2);
 assert.equal(d.channels.reduce((n,c)=>n+c.count,0),d.rows.length);
 assert.equal(Object.values(d.sentiments).reduce((a,b)=>a+b,0),d.rows.length);
 assert.equal(d.months.reduce((n,c)=>n+c.count,0)+d.undated,d.rows.length);
 assert.equal(d.undated,1);
 assert.equal(analyticsCuts(doctors,[first,second],{period:'12',now}).undated,0);
});
test('profile, cohort and dashboard share canonical article counts without losing statements',()=>{
 const p={...people[0],affiliation:'Hospital A',specialties:['Cardiology'],footprints:[]};
 const first={...row,who:'Dr Doctor Alpha',specialty:'Cardiology',role:'Hospital A',source:'first',sourceEvidence:{url:'https://example.org/article?id=1&utm_source=x'}};
 const second={...first,id:'two',text:'A different observation.',source:'second',date:null,sourceEvidence:{url:'https://example.org/article?id=1#quote'}};
 const links={first:first.sourceEvidence,second:second.sourceEvidence};
 const cohort=reconcileListening([p],[first,second],links);
 assert.equal(cohort.statements.length,2);assert.equal(cohort.doctors[0].activities,1);
 assert.equal(cohort.doctors[0].lastActivity,'2026-09-01');
 assert.equal(buildPersonas([p],[],[],cohort.statements)[0].listeningActivities,1);
 assert.equal(voiceDashboard([p],cohort.statements,{period:'all',now}).sources,1);
 assert.equal(voiceDashboard([p],cohort.statements,{period:'12',now}).rows.length,1);
});
test('evidence filter changes every chart and active-doctor count without changing cohort membership',()=>{
 const checked={...row,sourceEvidence:{...row.sourceEvidence,check:'page'}};
 const indexed={...row,id:'indexed',cohortIds:['b'],text:'Indexed thyroid commentary.',themes:['Thyroid'],sentiment:'Negative',sourceEvidence:{url:'https://example.org/indexed',check:'index'}};
 const all=voiceDashboard(people,[checked,indexed],{now});
 const page=voiceDashboard(people,[checked,indexed],{now,evidence:'page'});
 const index=voiceDashboard(people,[checked,indexed],{now,evidence:'index'});
 assert.equal(all.rows.length,2);assert.equal(page.rows.length,1);assert.equal(index.rows.length,1);
 assert.equal(page.members.length,all.members.length);assert.equal(page.doctors,1);
 assert.equal(index.sentiments.Negative,1);assert.equal(index.sentiments.Positive,0);
 assert.deepEqual(index.themes,[['Thyroid',1]]);assert.ok(index.words.some(w=>w.word==='thyroid'));
 assert.ok(!page.words.some(w=>w.word==='thyroid'));
 assert.equal(voiceDashboard(people,[row],{now,evidence:'page'}).rows.length,0);
 assert.throws(()=>voiceDashboard(people,[row],{evidence:'verified'}),/Unknown evidence/);
});
test('undated duplicate imports cannot inflate cohort, theme, sentiment or word-cloud counts',()=>{
 const p={...people[0],affiliation:'Hospital A',specialties:['Cardiology'],footprints:[]};
 const first={...row,date:null,who:'Dr Doctor Alpha',specialty:'Cardiology',role:'Hospital A',source:'first'};
 const copy={...first,id:'duplicate'};
 const cohort=reconcileListening([p],[first,copy],{first:first.sourceEvidence});
 assert.equal(cohort.statements.length,1);
 assert.equal(cohort.doctors[0].statementIds.length,1);
 assert.equal(cohort.doctors[0].activities,1);
 assert.equal(cohort.doctors[0].lastActivity,null);
 const d=voiceDashboard([p],cohort.statements,{period:'all',now});
 assert.equal(d.rows.length,1);assert.equal(d.doctors,1);assert.equal(d.sources,1);
 assert.deepEqual(d.themes,[['Safety',1]]);assert.equal(d.sentiments.Positive,1);
 assert.equal(d.words.find(w=>w.word==='safety').instances,2);
 assert.equal(voiceDashboard([p],cohort.statements,{period:'12',now}).rows.length,0);
});
test('archetype charts include only matching confirmed cohort members and deduplicate statements',()=>{
 const d=voiceDashboard(people,[row,row,{...row,id:'two',cohortIds:['b']}],{group:'Trendsetters',now});
 assert.equal(d.members.length,1);assert.equal(d.rows.length,1);assert.equal(d.doctors,1);assert.equal(d.sources,1);
 assert.deepEqual(d.themes,[['Safety',1]]);assert.equal(d.sentiments.Positive,1);
 const w=d.words.find(w=>w.word==='safety');assert.equal(w.instances,2);assert.deepEqual(w.statementIds,['one']);
 assert.ok(wordTokens(row.text).includes('t2dm'));assert.ok(wordTokens(row.text).includes('glp-1'));
});
test('unknown tiers, empty cohorts and unavailable evidence never produce invented charts',()=>{
 const d=voiceDashboard(people,[row],{group:'Trailblazers',now});assert.equal(d.rows.length,0);assert.equal(d.words.length,0);
 assert.equal(voiceDashboard(people,[{...row,sourceEvidence:null}],{now}).rows.length,0);
 assert.equal(voiceDashboard(people,[{...row,date:'2027-01-01'}],{now,period:'all'}).rows.length,0);
 assert.equal(voiceDashboard(people,[{...row,date:'2023-01-01'}],{now}).rows.length,0);
 assert.equal(voiceDashboard(people,[{...row,date:'2023-01-01'}],{now,period:'all'}).rows.length,1);
});
test('conflicting statement IDs are held, not resolved by input order',()=>{
 const d=voiceDashboard(people,[row,{...row,text:'Conflicting attribution'}],{now});
 assert.equal(d.rows.length,0);assert.deepEqual(d.conflicts,['one']);
});
test('new dashboard modules are served by the shared asset allowlist',()=>{
 for(const name of ['voice-dashboard.mjs','voice-dashboard-ui.mjs','analytics-ui.mjs','statement-quality.mjs'])assert.equal(publicAsset('/'+name),name);
});
test('period and archetype filters cannot hide conflicting source identities',()=>{
 for(const change of [{date:'2023-01-01'},{cohortIds:['b']}]){
  const d=voiceDashboard(people,[row,{...row,...change}],{group:'Trendsetters',now});
  assert.equal(d.rows.length,0);assert.deepEqual(d.conflicts,['one']);
 }
});
