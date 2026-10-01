import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { researchProfiles } from './data.mjs';

const context=vm.createContext({$:()=>({addEventListener(){}})});
vm.runInContext(readFileSync(new URL('./coverage.js',import.meta.url),'utf8'),context);
const build=context.geographyMekkoData;

test('Marimekko cell area equals its share of mapped doctors',()=>{
  const columns=build(researchProfiles);
  assert.ok(Math.abs(columns.reduce((sum,c)=>sum+c.width,0)-1)<1e-10);
  assert.equal(columns.reduce((sum,c)=>sum+c.count,0),researchProfiles.length);
  for(const column of columns){
    assert.ok(Math.abs(column.segments.reduce((sum,s)=>sum+s.height,0)-1)<1e-10);
    for(const segment of column.segments){
      assert.ok(Math.abs(column.width*segment.height-segment.count/researchProfiles.length)<1e-10);
    }
  }
});

test('Marimekko recomputes widths after geographic filtering',()=>{
  const columns=build(researchProfiles.filter(p=>p.region==='South'));
  assert.equal(columns.length,1);
  assert.equal(columns[0].width,1);
  assert.equal(columns[0].region,'South');
});

test('Marimekko empty selection has no fabricated segments',()=>{
  assert.equal(build([]).length,0);
});

test('New specialties retain their own names and do not disappear or inflate Cardiology',()=>{
  const people=[{region:'South',specialties:['Cardiac Anaesthesiology']},{region:'South',specialties:['Cardiology']}];
  const column=build(people)[0];
  assert.equal(column.segments.length,2);
  assert.equal(column.segments.reduce((n,s)=>n+s.count,0),2);
  assert.equal(column.segments.find(s=>s.specialty==='Cardiac Anaesthesiology').height,0.5);
  assert.equal(column.segments.find(s=>s.specialty==='Cardiology').count,1);
  assert.ok(context.coverageSpecialtyLabels(people).includes('Cardiac Anaesthesiology'));
});

test('Marimekko conserves records with unknown geography',()=>{
  const columns=build([{...researchProfiles[0],region:null}]);
  assert.equal(columns[0].region,'Unclassified');
  assert.equal(columns[0].width,1);
});
