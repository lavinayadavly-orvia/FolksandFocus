import fs from 'node:fs';
import {confirmedCohort} from '../generated/confirmed-cohort.mjs';
import {resolveArticleDiscovery} from '../article-discovery.mjs';
const path=process.argv[2];
if(!path)throw Error('Usage: node scripts/import-hospital-articles.mjs COLLECTION_JSON');
const result=resolveArticleDiscovery(confirmedCohort,JSON.parse(fs.readFileSync(path,'utf8')));
if(process.argv.includes('--require-full-cohort')&&result.doctors.some(d=>d.status==='NOT_CHECKED'))throw Error('Incomplete article-discovery cohort; existing artifact was not changed');
fs.writeFileSync(new URL('../generated/article-discovery.mjs',import.meta.url),`// Generated review candidates, not clinician statements or social posts.\nexport const articleDiscovery=${JSON.stringify(result,null,2)};\n`);
console.log(JSON.stringify(result.summary));
