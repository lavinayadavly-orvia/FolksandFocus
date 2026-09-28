import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPersona,buildPersonas,inPersonaGroup,pageItems,uniqueRecords,personaGroups} from './persona-model.mjs';
const now=new Date('2026-09-28T00:00:00Z');
const exp=years=>({medical_registration_year:2026-years,verification_status:'VERIFIED',registration_source_url:'https://example.org/registry',verified_by:'Registry reviewer',verified_at:'2026-09-28T00:00:00Z'});
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
