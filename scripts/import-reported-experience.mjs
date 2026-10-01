import fs from 'node:fs';
import crypto from 'node:crypto';
import {confirmedCohort} from '../generated/confirmed-cohort.mjs';
import {reportedExperience} from '../generated/reported-experience.mjs';

const input=process.argv[2];
if(!input)throw new Error('Supply the saved public Medicover directory HTML');
const html=fs.readFileSync(input,'utf8');
const raw=html.match(/\ballDoctorsData\s*=\s*(\[[\s\S]*?\])\s*;/)?.[1];
if(!raw)throw new Error('Public directory JSON not found');
const doctors=JSON.parse(raw),checkedAt=fs.statSync(input).mtime.toISOString();
const normalize=name=>name.toLowerCase().replace(/\b(?:dr|prof|professor)\b/g,'').replace(/[^a-z]/g,'');
const observations=[],review=[];
for(const row of doctors){
  const matches=confirmedCohort.doctors.filter(p=>p.profile_urls.includes(row.profile));
  if(!matches.length)continue;
  const years=Number(row.experience);
  if(matches.length!==1||normalize(matches[0].name)!==normalize(row.name)||!/^\d{1,2}$/.test(String(row.experience))||years>80){review.push({profileUrl:row.profile,reason:'Identity or experience requires review'});continue;}
  observations.push({hcpId:matches[0].cohort_id,nameAsReported:row.name,years,profileUrl:row.profile,
    publisher:'Medicover Hospitals',sourceUrl:'https://www.medicoverhospitals.in/doctors/',sourceLocator:`allDoctorsData did=${row.did}`,checkedAt,
    sha256:crypto.createHash('sha256').update(html).digest('hex'),registryVerified:false});
}
if(!observations.length)throw new Error('No matched observations; existing output preserved');
const merged=new Map(reportedExperience.map(r=>[r.hcpId+'|'+r.sourceUrl,r]));
for(const r of observations)merged.set(r.hcpId+'|'+r.sourceUrl,r);
fs.writeFileSync(new URL('../generated/reported-experience.mjs',import.meta.url),`export const reportedExperience = ${JSON.stringify([...merged.values()],null,2)};\n`);
console.log(JSON.stringify({observations:observations.length,doctors:new Set(observations.map(r=>r.hcpId)).size,review},null,2));
