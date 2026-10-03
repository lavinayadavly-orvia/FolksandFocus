import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('private artifacts cannot be written inside the served repository',()=>{
  const repository=fileURLToPath(new URL('..',import.meta.url));
  for(const script of ['audit-validation-baseline.mjs','export-validation-baseline.mjs']){
    for(const directory of [repository,join(repository,'private-test-output')]){
      const run=spawnSync(process.execPath,[fileURLToPath(new URL(script,import.meta.url)),directory]);
      assert.equal(run.status,1);
      assert.match(run.stderr.toString(),/Private research directory required|Research artifacts must stay outside the served repository/);
    }
  }
});

async function fixture(bad=false){
  const dir=await mkdtemp(join(tmpdir(),'validation-audit-test-'));
  const generatedAt=new Date().toISOString();
  const pending=[{parameter:'qualifications',bucket:'LATER',reason:'Missing',nextAction:'Check hospital'}];
  const record={id:'p1',pending,fields:{name:{value:'Test Doctor',status:'SOURCE_SUPPORTED',sources:[{url:bad?'not-url':'https://hospital.example/doctor',checkedAt:'2026-10-03'}]},qualifications:{value:null,status:'UNRESOLVED',sources:[]}}};
  const files={'cohort-validation-baseline.json':{generatedAt,records:[record]},'field-completeness.json':{generatedAt,cohortRecords:1,fieldCompleteness:{name:{SOURCE_SUPPORTED:1},qualifications:{UNRESOLVED:1}},uploadedCsvMerged:false,uniqueCombinedDoctorCount:null,initialScans:{NOT_STARTED:1}},'residual-later-queue.json':{generatedAt,items:[{id:'p1',missingParameters:bad?[]:pending}]}};
  for(const [name,value]of Object.entries(files))await writeFile(join(dir,name),JSON.stringify(value));
  return dir;
}
test('passing integrity never implies completion',async()=>{
  const dir=await fixture();
  try{
    const run=spawnSync(process.execPath,[fileURLToPath(new URL('./audit-validation-baseline.mjs',import.meta.url)),dir]);
    assert.equal(run.status,0,run.stderr.toString());
    const report=JSON.parse(await readFile(join(dir,'validation-quality-report.json')));
    assert.equal(report.integrityStatus,'PASS');assert.equal(report.completionStatus,'INCOMPLETE');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('invalid source and missing queue fail integrity audit',async()=>{
  const dir=await fixture(true);
  try{
    const run=spawnSync(process.execPath,[fileURLToPath(new URL('./audit-validation-baseline.mjs',import.meta.url)),dir]);
    assert.equal(run.status,1);
    const report=JSON.parse(await readFile(join(dir,'validation-quality-report.json')));
    assert.ok(report.issues.some(i=>i.code==='INVALID_PROVENANCE'));
    assert.ok(report.issues.some(i=>i.code==='QUEUE_MISMATCH'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
