import test from 'node:test';
import assert from 'node:assert/strict';
import { executiveBrief, discoverPhrases, collectionCoverage, activitySummary } from './listening-analytics.mjs';
import {listeningCohort} from './listening-cohort.mjs';
import {researchProfiles,articleDiscovery} from './data.mjs';
import {sourceReviewRecords} from './source-review.mjs';
const window={start:'2026-01-01',end:'2026-09-29',months:['2026-09']};
const links={one:{url:'https://example.org/a',check:'page'},copy:{url:'https://example.org/a#quote',check:'page'},two:{url:'https://example.org/b',check:'index'}};
const row=(id,who,source,extra={})=>({id,who,source,date:'2026-09-01',themes:['Kidney Protection'],text:'Kidney protection needs discussion.',sentiment:'Mixed / neutral',role:'Consultant',specialty:'Medicine',channel:'News',...extra});
test('tracking aliases count as one activity and unknown dates never get a month',()=>{
 const sources={a:{url:'https://example.org/article?id=1&utm_source=news#quote',check:'page'},b:{url:'https://example.org/article?id=1',check:'page'},c:{url:'https://example.org/article?id=2',check:'page'},bad:{url:'javascript:alert(1)'}};
 const rows=[row('a','Dr Example','a'),row('b','Dr Example','b',{text:'Another statement.'}),row('c','Dr Other','c',{date:null}),row('bad','Dr Example','bad')];
 const recent=activitySummary(rows,sources,window);
 assert.equal(recent.activities.length,1);assert.equal(recent.statements,2);
 const all=activitySummary(rows,sources,{...window,includeUndated:true});
 assert.equal(all.activities.length,2);assert.equal(all.sources,2);
 assert.equal(all.months[0].activities,1);
 const brief=executiveBrief(rows,sources,{...window,includeUndated:true});
 assert.equal(brief.quality.total,2);assert.equal(brief.summary.doctors,2);
 assert.equal(brief.latestDate,'2026-09-01');
 assert.equal(brief.voices.find(v=>v.name==='Dr Other').latest.date,null);
});
test('collection coverage uses canonical records, not stale source-report totals',()=>{
 const c=collectionCoverage(listeningCohort);
 assert.equal(c.total,2023);
 assert.deepEqual(c.checks.slice(0,2).map(r=>r.checked),[2023,1600]);
 assert.equal(c.checks[2].checked,articleDiscovery.summary.counts.PROFILE_CHECKED);
 assert.equal(c.checks[2].notEstablished,articleDiscovery.summary.counts.PROFILE_ACCESS_UNAVAILABLE+articleDiscovery.summary.counts.NOT_CHECKED);
 const reviewCounts=researchProfiles.map(p=>sourceReviewRecords(p).length);
 assert.equal(c.doctorsWithReviewLinks,reviewCounts.filter(n=>n>0).length);
 assert.equal(c.reviewLinks,reviewCounts.reduce((a,b)=>a+b,0));
 assert.equal(c.linkedAccountDoctors,4);assert.equal(c.nativePosts,2);
 assert.ok(c.checks.every(r=>r.checked+r.notEstablished===c.total&&r.checkedAt));
});
test('collection coverage cannot confuse pending searches or discovered links with captured posts',()=>{
 const d={id:'one',publicationSearch:{status:'PENDING'},sourcePageChecked:false,articleDiscoveryStatus:'NOT_CHECKED',accounts:[],discoveredSourceCount:8};
 const c=collectionCoverage({cohortTotal:1,doctors:[d],posts:[]});
 assert.ok(c.checks.every(r=>r.checked===0));assert.equal(c.reviewLinks,8);assert.equal(c.nativePosts,0);
 assert.equal(collectionCoverage(null),null);
 assert.equal(collectionCoverage({cohortTotal:2,doctors:[d]}),null);
 assert.equal(collectionCoverage({cohortTotal:2,doctors:[d,d]}),null);
});
test('brief deduplicates voice-source activity without hiding attributed quotations',()=>{
 const b=executiveBrief([row('1','Dr A','one'),row('2','Dr A','copy'),row('3','Dr B','two')],links,window);
 assert.equal(b.summary.doctors,2);assert.equal(b.namedActivities,2);assert.equal(b.quality.total,2);
 assert.equal(b.quality.pageChecked,1);assert.equal(b.quality.indexOnly,1);assert.equal(b.voices[0].activities,1);
});
test('collective voices are separate, not counted as doctors or authority',()=>{
 const b=executiveBrief([row('1','National cardiology expert panel','one'),row('2','Dr A','two')],links,window);
 assert.equal(b.summary.doctors,1);assert.equal(b.namedActivities,1);assert.equal(b.otherActivities,1);
 assert.deepEqual(b.voices.map(v=>v.name),['Dr A']);assert.equal(b.voices[0].authority,undefined);
});
test('brief excludes future and unsourced records and handles empty selections',()=>{
 const b=executiveBrief([row('1','Dr A','missing'),row('2','Dr B','one',{date:'2027-01-01'})],links,window);
 assert.equal(b.summary.doctors,0);assert.equal(b.active,null);assert.equal(b.latestDate,null);assert.deepEqual(b.voices,[]);
});
test('topic selection changes attributable voices and preserves their source roles',()=>{
 const b=executiveBrief([row('1','Dr A','one'),row('2','Dr B','two',{themes:['T2DM'],role:'Professor'})],links,window,'T2DM');
 assert.equal(b.active.topic,'T2DM');assert.equal(b.voices[0].name,'Dr B');assert.equal(b.voices[0].latest.role,'Professor');
});
test('new clinical language generates topics without an obesity template',()=>{
 const rows=[row('1','Dr A','one'),row('2','Dr B','two')];
 assert.ok(discoverPhrases(rows).some(t=>t.name.includes('kidney protection')));
 assert.equal(executiveBrief(rows,links,window).topics[0].topic,'Kidney Protection');
});
test('mixed source checks remain uncertain rather than promoted to page-checked',()=>{
 const b=executiveBrief([row('1','Dr A','one'),row('2','Dr B','copy')],{...links,copy:{...links.copy,check:'index'}},window);
 assert.equal(b.quality.total,1);assert.equal(b.quality.other,1);assert.equal(b.quality.pageChecked,0);
});
