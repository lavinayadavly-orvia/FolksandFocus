import test from 'node:test';
import assert from 'node:assert/strict';
import {categories,divideSpecialty} from './specialty-division.mjs';
test('six explicit categories are mutually exclusive',()=>{
  for(const label of ['Diabetologist','Cardiologist','Endocrinologist','Gynecologist','Consulting Physician','General Practitioner']){
    const r=divideSpecialty(label);assert.ok(categories.includes(r.primaryCategory));assert.equal(r.secondaryCategories.length,0);
  }
});
test('cardiac anaesthesia stays deferred despite broad cardiology label',()=>{
  assert.equal(divideSpecialty(['Cardiac Anaesthesiology','Cardiology']).status,'DEFERRED_SPECIALTY');
});
test('DM resolves overlapping endocrine and diabetes labels',()=>{
  assert.equal(divideSpecialty(['Diabetology','Endocrinology'],'MBBS, MD, DM (Endocrinology)').primaryCategory,'Endocrinology');
  assert.equal(divideSpecialty(['Diabetology','Endocrinology'],'MBBS').primaryCategory,null);
});
test('CP GP ambiguity not resolved by MBBS alone',()=>{
  assert.equal(divideSpecialty(['General Medicine','General Practice'],'MBBS').primaryCategory,null);
  assert.equal(divideSpecialty(['General Medicine','General Practice'],'MD Internal Medicine').primaryCategory,'Consulting Physicians');
  assert.equal(divideSpecialty('Chest Physician','MBBS').primaryCategory,null);
});
