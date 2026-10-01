import fs from 'node:fs';
import crypto from 'node:crypto';
import {confirmedCohort} from '../generated/confirmed-cohort.mjs';
import {resolveProfileDiscovery} from '../profile-source-discovery.mjs';
const [path,cohortPath]=process.argv.slice(2);
if(!path||!cohortPath)throw Error('Usage: node scripts/import-profile-sources.mjs COLLECTION_JSON COHORT_JSON');
const input=JSON.parse(fs.readFileSync(path,'utf8'));
const hash=crypto.createHash('sha256').update(fs.readFileSync(cohortPath)).digest('hex');
if(input.cohortHash!==hash||hash!==confirmedCohort.checksum)throw Error('Cohort checksum mismatch');
const expected=new Set(confirmedCohort.doctors.flatMap(p=>p.profile_urls.map(url=>`${p.cohort_id}|${url}`))),seen=new Set();
for(const row of input.profiles){
  const key=`${row.cohortId}|${row.url}`;
  if(!expected.has(key)||seen.has(key))throw Error(`Unexpected or duplicate source identity: ${key}`);
  seen.add(key);
}
for(const p of confirmedCohort.doctors)for(const url of p.profile_urls){
  if(!input.profiles.some(r=>r.cohortId===p.cohort_id&&r.url===url))throw Error(`Missing profile check status: ${p.cohort_id}`);
}
const output=resolveProfileDiscovery(confirmedCohort.doctors,input);
fs.writeFileSync(new URL('../generated/profile-source-discovery.mjs',import.meta.url),`// Generated from public hospital profile-page metadata. Candidates are not verified social accounts or posts.\nexport const profileSourceDiscovery=${JSON.stringify(output,null,2)};\n`);
console.log(JSON.stringify(output.summary));
