import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRegistryCandidate, registrationYear } from './registry-resolution.mjs';
const now=new Date('2026-09-28T12:00:00Z');
const record={name:'Khadgawat Rajesh',registration_no:'13569',state_medical_council:'Rajasthan Medical Council',registration_date:'22-02-1991',qualification_year:'1991'};
test('exact professional fields do not prove first registration or auto-assign experience',()=>{
  const r=assessRegistryCandidate({name:'Dr. Rajesh Khadgawat',registration_number:'13569',state_medical_council:record.state_medical_council},record,now);
  assert.equal(r.identity_status,'REGISTRY_FIELDS_MATCHED');assert.equal(r.years_since_this_council_registration,35);assert.equal(r.years_of_experience,null);assert.equal(r.axis_1_tier,null);
});
test('registration prefixes and council namespaces cannot be stripped for exact matching',()=>{
  const r=assessRegistryCandidate({name:'Dr Rajesh Khadgawat',registration_number:'14920',state_medical_council:'Delhi Medical Council'},{...record,name:'ANJALI',registration_no:'DMC/R/14920',state_medical_council:'Delhi Medical Council'},now);
  assert.equal(r.identity_status,'REVIEW');assert.ok(r.flags.includes('REGISTRATION_NUMBER_CONFLICT'));assert.ok(r.flags.includes('NAME_REVIEW_REQUIRED'));
});
test('year of information and graduation are never registration fallbacks',()=>{
  const r=assessRegistryCandidate({name:record.name},{...record,registration_date:null,year_of_info:1992,qualification_year:'1992'},now);
  assert.equal(r.council_registration_year,null);assert.equal(r.years_of_experience,null);
});
test('late council dates are flagged rather than silently used as career start',()=>{
  const r=assessRegistryCandidate({name:'Sanjay Kalra'},{...record,name:'SANJAY KALRA',registration_date:'03-11-2006',qualification_year:'1991'},now);
  assert.ok(r.flags.includes('POSSIBLE_LATER_COUNCIL_REGISTRATION'));
});
test('invalid and future registry dates are held for review',()=>{
  assert.equal(registrationYear('04-11-2026',now),null);assert.equal(registrationYear('31-02-1991',now),null);assert.equal(registrationYear('22-02-1991',now),1991);
});
