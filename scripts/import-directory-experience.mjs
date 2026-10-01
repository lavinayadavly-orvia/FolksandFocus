import fs from 'node:fs';
import {confirmedCohort} from '../generated/confirmed-cohort.mjs';
import {reportedExperience} from '../generated/reported-experience.mjs';
import {reviewedExperienceRecords} from '../reported-experience.mjs';
import {experienceReviews,experienceExclusions} from '../experience-reviews.mjs';
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const key=name=>name.toLowerCase().replace(/\b(?:dr|prof|professor)\b/g,'').replace(/[^a-z]/g,'');
const observations=[],review=[];
for(const page of input.pages){
  if(!['PAGE_CHECKED','PUBLIC_INDEX_READ'].includes(page.status))continue;
  if(page.status==='PUBLIC_INDEX_READ'&&(!page.accessNote||!(page.experienceRecords||[]).every(r=>r.identityBasis&&r.sourceLocator&&r.asReported)))throw new Error('Indexed experience requires access and identity evidence');
  const excluded=experienceExclusions.find(r=>r.url===page.url);
  if(excluded){review.push({url:page.url,reason:excluded.status});continue;}
  const records=reviewedExperienceRecords(page,experienceReviews);
  if(!records.length&&page.experienceCandidates?.length)review.push({url:page.url,reason:page.experienceReview});
  for(const r of records){
    const matches=confirmedCohort.doctors.filter(p=>p.profile_urls.includes(r.profileUrl));
    if(!matches.length)continue;
    if(matches.length!==1||key(matches[0].name)!==key(r.nameAsReported)||!Number.isFinite(r.years)||r.years<0||r.years>80){review.push(r.profileUrl);continue;}
    observations.push({...r,hcpId:matches[0].cohort_id,sourceUrl:page.url,checkedAt:page.checkedAt,sha256:page.sha256,sourceAccessStatus:page.status,accessNote:page.accessNote||null,registryVerified:false});
  }
}
if(!observations.length)throw new Error('No matched experience; output unchanged');
const merged=new Map(reportedExperience.map(r=>[r.hcpId+'|'+r.sourceUrl,r]));
for(const r of observations)merged.set(r.hcpId+'|'+r.sourceUrl,r);
fs.writeFileSync(new URL('../generated/reported-experience.mjs',import.meta.url),`export const reportedExperience = ${JSON.stringify([...merged.values()],null,2)};\n`);
console.log(JSON.stringify({addedDoctors:new Set(observations.map(r=>r.hcpId)).size,totalDoctors:new Set([...merged.values()].map(r=>r.hcpId)).size,review},null,2));
