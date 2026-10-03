import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {categories,divideSpecialty} from '../specialty-division.mjs';
const directory=resolve(process.argv[2]||'../doctor-reconciliation-private');
const repository=fileURLToPath(new URL('..',import.meta.url));
if(directory===repository.replace(/\/$/,'')||directory.startsWith(repository))throw Error('Private output required');
const cohort=JSON.parse(await readFile(resolve(directory,'cohort-validation-baseline.json')));
const upload=JSON.parse(await readFile(resolve(directory,'priority-workbook-import.json')));
const records=[
  ...cohort.records.map(r=>({source:'EXISTING_COHORT',id:r.id,name:r.fields.name.value,evidence:r.fields.specialties.sources, ...divideSpecialty(r.fields.specialties.value,r.fields.qualifications.value)})),
  ...upload.records.map(r=>({source:'UPLOADED_PRIORITY_SHEET',id:r.sourceId,name:r.supplied['Full Name'],sheet:r.sheet,row:r.row,evidenceStatus:r.evidenceStatus,...divideSpecialty(r.supplied['Validated Specialty'],r.supplied.Qualification)})),
];
const summary={generatedAt:new Date().toISOString(),uniqueCombinedDoctorCount:null,countsAreSourceRecordsNotDeduplicatedDoctors:true,sources:{}};
for(const source of ['EXISTING_COHORT','UPLOADED_PRIORITY_SHEET']){
  const rows=records.filter(r=>r.source===source);
  const counts=Object.fromEntries(categories.map(c=>[c,rows.filter(r=>r.primaryCategory===c).length]));
  const later=rows.filter(r=>!r.primaryCategory).length;
  if(Object.values(counts).reduce((a,b)=>a+b,0)+later!==rows.length)throw Error('Unreconciled counts');
  summary.sources[source]={totalRecords:rows.length,categories:counts,later};
}
await writeFile(resolve(directory,'specialty-division.json'),JSON.stringify({summary,records},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(summary,null,2));
