import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=resolve(process.argv[2]||'../doctor-reconciliation-private');
const repository=resolve(fileURLToPath(new URL('..',import.meta.url)));
if(directory===repository||directory.startsWith(repository+'/'))throw Error('Private research directory required');
const read=async name=>JSON.parse(await readFile(resolve(directory,name),'utf8'));
const database=await read('cohort-validation-baseline.json');
const summary=await read('field-completeness.json');
const queue=await read('residual-later-queue.json');
const issues=[];
const add=(id,field,code)=>issues.push({id,field,code});
const ids=new Set();
const queueById=new Map(queue.items.map(r=>[r.id,r]));
const counts={};
let populatedFields=0,sourceReferences=0,pendingTasks=0;
const urlValid=value=>{try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}};
for(const record of database.records){
  if(ids.has(record.id))add(record.id,null,'DUPLICATE_ID');
  ids.add(record.id);
  const queued=queueById.get(record.id);
  if(!queued)add(record.id,null,'MISSING_QUEUE_RECORD');
  if(JSON.stringify(record.pending)!==JSON.stringify(queued?.missingParameters))add(record.id,null,'QUEUE_MISMATCH');
  for(const task of record.pending){
    pendingTasks++;
    if(!task.parameter||!task.reason||!task.nextAction||task.bucket!=='LATER')add(record.id,task.parameter,'INCOMPLETE_NEXT_ACTION');
  }
  for(const [key,field]of Object.entries(record.fields)){
    counts[key]??={};counts[key][field.status]=(counts[key][field.status]||0)+1;
    const populated=field.value!=null&&(!Array.isArray(field.value)||field.value.length>0);
    if(populated){
      populatedFields++;
      if(!field.sources?.length)add(record.id,key,'MISSING_SOURCES');
      for(const source of field.sources||[]){
        sourceReferences++;
        if(!urlValid(source.url)||!Number.isFinite(Date.parse(source.checkedAt)))add(record.id,key,'INVALID_PROVENANCE');
        if(Date.parse(source.checkedAt)>Date.now()+86400000)add(record.id,key,'FUTURE_CHECK_DATE');
      }
    }
    if((field.coverageComplete===false||['UNRESOLVED','REVIEW_REQUIRED','CONFLICT_REVIEW','PROVENANCE_REVIEW','SEARCHED_NO_CONFIRMED_MATCH'].includes(field.status))&&!record.pending.some(t=>t.parameter===key))add(record.id,key,'MISSING_FOLLOW_UP');
    for(const entry of Array.isArray(field.value)?field.value:[]){
      if(key==='medicalReviews'&&(entry.authorshipEstablished!==false||entry.personalStatement!==false))add(record.id,key,'REVIEWER_ROLE_CONFLATION');
      if(key==='authoredArticles'&&(entry.role!=='AUTHOR'||entry.authorshipEstablished!==true))add(record.id,key,'AUTHOR_ROLE_UNSUPPORTED');
    }
  }
}
if(ids.size!==summary.cohortRecords||queue.items.length!==ids.size||queueById.size!==ids.size)add(null,null,'TOTALS_MISMATCH');
for(const [field,statuses]of Object.entries(counts))for(const [status,count]of Object.entries(statuses))if(summary.fieldCompleteness[field]?.[status]!==count)add(null,field,'FIELD_TOTAL_MISMATCH');
if(database.generatedAt!==summary.generatedAt||database.generatedAt!==queue.generatedAt)add(null,null,'SNAPSHOT_MISMATCH');
const report={checkedAt:new Date().toISOString(),snapshotAt:database.generatedAt,records:ids.size,populatedFields,sourceReferences,pendingTasks,integrityStatus:issues.length?'FAIL':'PASS',issues,
  completionStatus:'INCOMPLETE',completionGaps:{uploadedCsvMerged:summary.uploadedCsvMerged,uniqueCombinedDoctorCount:summary.uniqueCombinedDoctorCount,initialScans:summary.initialScans,recordsWithPending:database.records.filter(r=>r.pending.length).length},
  limitations:['Integrity checks validate provenance structure, not source truth or medical qualifications.','A passing integrity audit does not certify completed doctor reviews.','Platform reconciliation and uploaded-cohort identity review remain outstanding.']};
await writeFile(resolve(directory,'validation-quality-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report,null,2));
if(issues.length)process.exitCode=1;
