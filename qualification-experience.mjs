import {classifyExperience} from './reported-experience.mjs';

export function mbbsCompletionYear(text, now=new Date()){
  const normalized=String(text||'').replace(/M\.B\.B\.S\.?/gi,'MBBS')
    .replace(/\|\s*((?:19|20)\d{2})\s*(?=\||$)/g,' ($1)');
  if(/\bMBBS\s+(?:students?|[1-5](?:st|nd|rd|th)|first|second|third|fourth|final|batch)\b/i.test(normalized))return null;
  const degree=normalized.match(/\bMBBS\b([^|]*)/i)?.[1]?.split(/\b(?:MD|MS|MCh|DM|DNB|DrNB|DGO|DCH|MRCP|MRCOG|FRCOG|Fellowship|Diploma|Diplomate|Master['’]?s?|Doctor of Medicine|Advanced|Robotic)\b|\b(?:M\.D\.|D\.N\.B\.)/i)[0];
  if(!degree)return null;
  const years=[...degree.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0]));
  let year=years.length===1?years[0]:null;
  const month='(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s+)?';
  if(years.length===2&&years[1]>years[0]&&years[1]-years[0]<=8&&new RegExp(`${years[0]}\\s*(?:[-–]|to)\\s*${month}${years[1]}`,'i').test(degree))year=years[1];
  return year!==null&&year>=1950&&year<=now.getUTCFullYear()?year:null;
}

export function attachQualificationExperience(profiles,cohort,now=new Date(),additionalEvidence=[]){
  const byId=new Map(cohort.map(p=>[p.cohort_id,p]));
  return profiles.map(p=>{
    if(p.experience||p.experienceReview)return p;
    const supplemental=additionalEvidence.filter(r=>r.hcpId===p.id&&r.nameAsReported===p.name&&r.identityBasis&&r.sourceLocator&&r.sourceAccessStatus);
    const claims=[...(byId.get(p.id)?.evidence||[]),...supplemental].map(r=>({...r,year:mbbsCompletionYear(r.qualifications,now)})).filter(r=>r.year!==null&&r.checked_at&&p.footprints.some(f=>f.type==='INSTITUTION'&&f.url===r.profile_url));
    if(!claims.length)return p;
    if(new Set(claims.map(r=>r.year)).size!==1)return {...p,experienceReview:'CONFLICTING_MBBS_YEARS'};
    const claim=claims[0],years=now.getUTCFullYear()-claim.year;
    const experience={minYears:years,maxYears:years,label:`${years} calendar years since MBBS (${claim.year})`,
      url:claim.profile_url,profileUrl:claim.profile_url,observedOn:claim.checked_at,status:'QUALIFICATION_BASED_ESTIMATE',
      qualificationYear:claim.year,asOfYear:now.getUTCFullYear(),asReported:claim.qualifications,
      sourceAccessStatus:claim.sourceAccessStatus||'PAGE_CHECKED',sourceLocator:claim.sourceLocator||claim.source_locator||null,accessNote:claim.accessNote||null,
      basis:`Estimated from the hospital-reported MBBS completion year, not confirmed years of practice. ${claim.accessNote?`${claim.accessNote} `:''}${now.getUTCFullYear()} minus ${claim.year}; medical registration and uninterrupted practice are not established.`};
    return {...p,experience,tier:classifyExperience({...p,experience},now)?.label||'Awaiting classification',classificationStatus:'QUALIFICATION_BASED_ESTIMATE'};
  });
}
