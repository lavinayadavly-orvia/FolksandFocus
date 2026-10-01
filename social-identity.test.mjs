import test from 'node:test';
import assert from 'node:assert/strict';
import {guardSocialRecords,socialSourceKey,guardSocialInteractions} from './social-identity.mjs';
import {buildSocialMonitor} from './social-monitor.mjs';
const people=[{id:'a',name:'Doctor A'},{id:'b',name:'Doctor B'}];
const account=(overrides={})=>({id:'x-a',hcpId:'a',platform:'X',profileUrl:'https://x.com/doctorA',identityStatus:'VERIFIED',collectionStatus:'CONNECTOR_REQUIRED',...overrides});
const post=(overrides={})=>({id:'p1',hcpId:'a',accountId:'x-a',platform:'X',url:'https://x.com/doctorA/status/123',reviewStatus:'VERIFIED',...overrides});
test('likes are deduplicated actor activity without target sentiment or authorship',()=>{
 const row={id:'like',accountId:'x-a',hcpId:'a',platform:'X',activityType:'LIKE',targetUrl:'https://x.com/other/status/123',observedAt:'2026-10-01',evidenceUrl:'https://x.com/doctorA',evidenceLocator:'Liked by doctorA',reviewStatus:'VERIFIED',text:'Target opinion',sentiment:'positive'};
 const result=guardSocialInteractions([row,{...row,id:'duplicate'}],[account()]);
 assert.equal(result.interactions.length,1);
 assert.equal(result.interactions[0].statementAttribution,false);
 assert.equal(result.interactions[0].sentiment,null);
 assert.equal(result.interactions[0].text,undefined);
 assert.equal(result.interactions[0].occurredAt,null);
 assert.equal(guardSocialInteractions([row],[]).interactions.length,0);
 assert.equal(guardSocialInteractions([{...row,activityType:'COMMENT'}],[account()]).interactions.length,0);
});
test('platform URLs normalize aliases and tracking without trusting lookalike hosts',()=>{
  assert.equal(socialSourceKey('https://twitter.com/DoctorA/?utm_source=x','X'),socialSourceKey(account().profileUrl,'X'));
  for(const url of ['https://x.com.evil.test/doctorA','https://x.com@evil.test/doctorA','javascript:alert(1)','https://x.com/home'])assert.equal(socialSourceKey(url,'X'),null);
  assert.equal(socialSourceKey('https://youtu.be/abcdefghijk?t=5','YouTube',true),socialSourceKey('https://youtube.com/watch?v=abcdefghijk','YouTube',true));
  assert.equal(socialSourceKey('https://linkedin.com/company/hospital','LinkedIn'),null);
});
test('account and post duplicates count once and account aliases retain linked posts',()=>{
  const r=guardSocialRecords([account(),account({id:'alias',profileUrl:'https://twitter.com/DOCTORA'})],[post({accountId:'alias'}),post({id:'p2',url:'https://twitter.com/doctorA/status/123?ref=x'})],people);
  assert.equal(r.accounts.length,1);assert.equal(r.posts.length,1);assert.equal(r.posts[0].accountId,'x-a');assert.equal(r.duplicates.length,2);
});
test('profile handles must agree with explicit URL handles without treating display names as ownership proof',()=>{
 for(const [platform,profileUrl,handle] of [['X','https://x.com/doctorA','@DoctorA'],['Instagram','https://instagram.com/doctor.a/','doctor.a'],['YouTube','https://youtube.com/@DoctorA','@DoctorA']]){
  const a=account({platform,profileUrl,handle});
  assert.equal(guardSocialRecords([a],[],people).accounts.length,1);
  const bad=guardSocialRecords([{...a,handle:'@SomeoneElse'}],[],people);
  assert.equal(bad.accounts.length,0);assert.equal(bad.review[0].reason,'PROFILE_HANDLE_MISMATCH');
 }
 assert.equal(guardSocialRecords([account({handle:null})],[],people).accounts.length,1);
 assert.equal(guardSocialRecords([account({handle:'  @DOCTORA  '})],[],people).accounts.length,1);
 assert.equal(guardSocialRecords([account({platform:'YouTube',profileUrl:'https://youtube.com/channel/UC123',handle:'@DoctorA'})],[],people).accounts.length,1);
});
test('a conflicting displayed handle holds aliases and their posts regardless of input order',()=>{
 const a=account({handle:'@DoctorA'}),b=account({id:'alias',handle:'@WrongDoctor'});
 for(const input of [[a,b],[b,a]]){
  const r=guardSocialRecords(input,[post(),post({id:'p2',accountId:'alias'})],people);
  assert.equal(r.accounts.length,0);assert.equal(r.posts.length,0);
  assert.equal(r.review.filter(x=>x.reason==='PROFILE_HANDLE_MISMATCH').length,2);
 }
});
test('all sides of conflicting account ownership are held regardless of order',()=>{
  const input=[account(),account({id:'other',hcpId:'b'}),account({id:'third'})];
  for(const rows of [input,[...input].reverse()]){const r=guardSocialRecords(rows,[post()],people);assert.equal(r.accounts.length,0);assert.equal(r.posts.length,0);assert.equal(r.review.length,4);}
});
test('unknown, unverified, mismatched doctor and cross-platform posts are excluded',()=>{
  const r=guardSocialRecords([account(),account({id:'pending',identityStatus:'PENDING'}),account({id:'unknown',hcpId:'z'})],[post({hcpId:'b'}),post({id:'p2',platform:'Instagram'}),post({id:'p3',reviewStatus:'PENDING'})],people);
  assert.equal(r.accounts.length,1);assert.equal(r.posts.length,0);assert.equal(r.review.length,5);
});
test('conflicting post attribution and reused IDs cannot silently select a winner',()=>{
  const r=guardSocialRecords([account(),account({id:'x-b',hcpId:'b',profileUrl:'https://x.com/doctorB'})],[post(),post({id:'p2',accountId:'x-b',hcpId:'b',url:'https://x.com/doctorB/status/123'})],people);
  assert.equal(r.posts.length,0);assert.equal(r.review.length,2);
  assert.equal(guardSocialRecords([account()],[post(),post({url:'https://x.com/doctorA/status/456'})],people).posts.length,0);
});
test('monitor applies the same guards and never advertises a public observation as live tracking',()=>{
  const m=buildSocialMonitor([account({collectionStatus:'PUBLIC_OBSERVATION'}),account({id:'alias'})],[post(),post({id:'duplicate'})],people);
  assert.equal(m.accounts.length,1);assert.equal(m.posts.length,1);assert.equal(m.platformSummary.find(p=>p.platform==='X').status,'PUBLIC_OBSERVATION');assert.equal(m.quality.duplicates.length,2);
});
test('a post URL naming a different X author cannot be attributed by account ID alone',()=>{
  const r=guardSocialRecords([account()],[post({url:'https://x.com/someoneElse/status/123'})],people);
  assert.equal(r.posts.length,0);assert.equal(r.review[0].reason,'POST_URL_OWNER_MISMATCH');
});
test('missing collection status cannot imply collection is active',()=>{
  const m=buildSocialMonitor([account({collectionStatus:undefined})],[],people);
  assert.equal(m.platformSummary.find(p=>p.platform==='X').status,'CONNECTOR_REQUIRED');
});
test('LinkedIn permalink identity comes from the final activity ID, not headline numbers',()=>{
  const first='https://www.linkedin.com/posts/doctor-a_activity-2024-update-activity-7123456789012345678-AbCd?utm_source=share';
  const second='https://in.linkedin.com/posts/doctor-a_activity-2024-update-activity-7987654321098765432-XyZ';
  const feed='https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/';
  assert.equal(socialSourceKey(first,'LinkedIn',true),socialSourceKey(feed,'LinkedIn',true));
  assert.notEqual(socialSourceKey(first,'LinkedIn',true),socialSourceKey(second,'LinkedIn',true));
  assert.equal(socialSourceKey('https://linkedin.com/posts/no-activity-id','LinkedIn',true),null);
  const a=account({platform:'LinkedIn',profileUrl:'https://linkedin.com/in/doctor-a'});
  const r=guardSocialRecords([a],[post({platform:'LinkedIn',url:first}),post({id:'alias',platform:'LinkedIn',url:feed}),post({id:'distinct',platform:'LinkedIn',url:second})],people);
  assert.equal(r.posts.length,2);assert.equal(r.duplicates.length,1);
});
test('nonstandard ports are held for review rather than treated as official platform URLs',()=>{
  assert.equal(socialSourceKey('https://x.com:8443/doctorA','X'),null);
  assert.equal(socialSourceKey('https://x.com:443/doctorA','X'),socialSourceKey(account().profileUrl,'X'));
  const r=guardSocialRecords([account({profileUrl:'https://x.com:8443/doctorA'})],[post()],people);
  assert.equal(r.accounts.length,0);assert.equal(r.posts.length,0);assert.equal(r.review.length,2);
});
test('conflicting versions of one post are held regardless of order, including late conflicting duplicates',()=>{
  for(const field of ['text','title','publishedAt','date','sentiment']){
    const rows=[post({[field]:'first'}),post({id:'copy',[field]:'first'}),post({id:'conflict',[field]:'different'})];
    for(const input of [rows,[...rows].reverse()]){
      const result=guardSocialRecords([account()],input,people);
      assert.equal(result.posts.length,0);
      assert.equal(result.review.length,3);
      assert.ok(result.review.every(r=>r.reason==='CONFLICTING_POST_CONTENT'));
    }
  }
});
test('engagement snapshots do not masquerade as statement-content conflicts',()=>{
  const result=guardSocialRecords([account()],[post({text:'Clinical commentary',metrics:{likes:1}}),post({id:'later',text:'Clinical commentary',metrics:{likes:2}})],people);
  assert.equal(result.posts.length,1);assert.equal(result.duplicates.length,1);assert.equal(result.review.length,0);
});
test('equivalent timestamp offsets and sentiment casing do not discard correct duplicate records',()=>{
  const result=guardSocialRecords([account()],[post({publishedAt:'2026-09-30T05:00:00Z',sentiment:'Positive'}),post({id:'alias',publishedAt:'2026-09-30T10:30:00+05:30',sentiment:'positive'})],people);
  assert.equal(result.posts.length,1);assert.equal(result.duplicates.length,1);assert.equal(result.review.length,0);
});
test('complementary duplicate post fields survive either import order without mutating inputs',()=>{
  const rows=[post({text:'Clinical commentary',title:'',date:null}),post({id:'enriched',title:'Clinical update',publishedAt:'2026-09-30T05:00:00Z',date:'2026-09-30',sentiment:'Positive'})];
  const original=structuredClone(rows);
  for(const input of [rows,[...rows].reverse()]){
    const result=guardSocialRecords([account()],input,people);
    assert.equal(result.posts.length,1);assert.equal(result.duplicates.length,1);assert.equal(result.review.length,0);
    const p=result.posts[0];
    assert.equal(p.text,'Clinical commentary');assert.equal(p.title,'Clinical update');
    assert.equal(p.date,'2026-09-30');assert.equal(p.publishedAt,'2026-09-30T05:00:00Z');assert.equal(p.sentiment,'Positive');
    const monitor=buildSocialMonitor([account()],input,people);
    assert.equal(monitor.posts[0].date,p.date);assert.equal(monitor.posts[0].text,p.text);
  }
  assert.deepEqual(rows,original);
});
test('a late conflicting duplicate is held rather than merged into an incomplete post',()=>{
  const rows=[post(),post({id:'one',text:'First claim'}),post({id:'two',text:'Different claim'})];
  for(const input of [rows,[...rows].reverse()]){
    const result=guardSocialRecords([account()],input,people);
    assert.equal(result.posts.length,0);assert.equal(result.review.length,3);
    assert.ok(result.review.every(r=>r.reason==='CONFLICTING_POST_CONTENT'));
  }
});
test('conflicting date and publishedAt fields hold every alias, including conflicts within one record',()=>{
  for(const rows of [
    [post({date:'2026-09-28',publishedAt:'2026-09-30T05:00:00Z'})],
    [post({date:'2026-09-28'}),post({id:'timestamp',publishedAt:'2026-09-30T05:00:00Z'}),post({id:'empty'})],
    [post({date:'2026-09-30T06:00:00Z',publishedAt:'2026-09-30T05:00:00Z'})]
  ])for(const input of [rows,[...rows].reverse()]){
    const original=structuredClone(input);
    const result=guardSocialRecords([account()],input,people);
    assert.equal(result.posts.length,0);assert.equal(result.review.length,input.length);
    assert.ok(result.review.every(r=>r.reason==='CONFLICTING_PUBLICATION_DATES'));
    assert.equal(buildSocialMonitor([account()],input,people).posts.length,0);
    assert.deepEqual(input,original);
  }
});
test('source-local and UTC calendar dates remain compatible with an offset timestamp',()=>{
  for(const date of ['2026-09-29','2026-09-30','2026-09-29T20:00:00Z',null]){
    const rows=[post({date}),post({id:'timestamp',publishedAt:'2026-09-30T01:30:00+05:30'})];
    for(const input of [rows,[...rows].reverse()]){
      const result=guardSocialRecords([account()],input,people);
      assert.equal(result.posts.length,1);assert.equal(result.review.length,0);
      assert.equal(result.posts[0].publishedAt,'2026-09-30T01:30:00+05:30');
    }
  }
});
