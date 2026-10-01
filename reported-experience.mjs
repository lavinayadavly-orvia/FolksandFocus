import {EXPERIENCE_TIERS, verifiedExperience} from './experience.mjs';

export function consistentReportedAmounts(records){
  if(!records.length)return [];
  if(new Set(records.map(r=>r.years)).size!==1||new Set(records.map(r=>r.profileUrl)).size!==1||new Set(records.map(r=>r.nameAsReported)).size!==1)return [];
  return [{...(records.find(r=>r.lowerBound)||records[0]),supportingClaims:[...new Set(records.map(r=>r.asReported).filter(Boolean))]}];
}
export function reviewedExperienceRecords(page,reviews=[]){
  const records=page.experienceRecords||[];
  if(records.length)return records;
  const candidates=page.experienceCandidates||[];
  const compatible=consistentReportedAmounts(candidates);
  if(compatible.length)return compatible;
  const priority=page.sourcePriorityReview;
  if(priority?.checkedAt&&priority.checkedAt===page.checkedAt&&priority.basis&&candidates.length>1){
    const ranks={HOSPITAL_EXPERIENCE_FIELD:4,HOSPITAL_BIOGRAPHY:3,HOSPITAL_MEDIA_CAPTION:2,THIRD_PARTY_DIRECTORY:1};
    const valid=candidates.every(r=>r.nameAsReported===candidates[0].nameAsReported&&r.profileUrl===page.url&&r.sourceLocator&&r.asReported&&ranks[r.sourceKind]);
    const highest=Math.max(...candidates.map(r=>ranks[r.sourceKind]||0));
    const selection=priority.selectedClaim;
    const selectedCandidates=selection?candidates.filter(r=>r.years===selection.years&&r.lowerBound===selection.lowerBound&&r.sourceLocator===selection.sourceLocator):candidates.filter(r=>ranks[r.sourceKind]===highest);
    const preferred=valid&&(!selection||selectedCandidates.length===1)?consistentReportedAmounts(selectedCandidates):[];
    if(preferred.length)return [{...preferred[0],scopeReview:{checkedAt:priority.checkedAt,basis:priority.basis},supportingClaims:candidates.map(r=>r.asReported),competingClaims:candidates}];
  }
  const review=reviews.find(r=>r.url===page.url&&r.sha256===page.sha256&&r.checkedAt&&r.basis);
  const selected=review&&candidates.find(r=>r.years===review.years&&Boolean(r.lowerBound)===review.lowerBound&&r.profileUrl===page.url);
  return selected?[{...selected,scopeReview:{checkedAt:review.checkedAt,basis:review.basis},supportingClaims:candidates.map(r=>r.asReported)}]:[];
}

export function classifyExperience(profile, now=new Date()) {
  if(profile?.roleReview?.status==='PHYSICIAN_ROLE_REVIEW_REQUIRED')return null;
  const verified=verifiedExperience(profile,now);
  if(verified)return {...verified,status:'REGISTRY_VERIFIED'};
  const evidence=profile?.experience;
  if(!evidence?.url || !/^https?:\/\//.test(evidence.url) || !evidence.observedOn)return null;
  const min=evidence.minYears,max=evidence.maxYears;
  if(!Number.isFinite(min)||min<0||min>80 || (max!==null&&(!Number.isFinite(max)||max<min||max>80)))return null;
  const bandMaximum=max??(evidence.useReportedMinimum?min:null);
  const tier=EXPERIENCE_TIERS.find(t=>min>=t.min&&(t.max===null||(bandMaximum!==null&&bandMaximum<t.max+1)));
  return tier?{...tier,years:min,status:evidence.status==='QUALIFICATION_BASED_ESTIMATE'?'QUALIFICATION_BASED_ESTIMATE':'HOSPITAL_REPORTED'}:null;
}

export function attachReportedExperience(profiles, observations, exclusions=[]) {
  return profiles.map(p=>{
    const roleReview=exclusions.find(r=>p.footprints.some(f=>f.type==='INSTITUTION'&&f.url===r.url));
    if(roleReview)return {...p,experience:null,experienceReview:roleReview.status,roleReview,tier:'Awaiting classification',classificationStatus:'NOT_ESTABLISHED'};
    const matches=observations.filter(r=>r.hcpId===p.id&&p.footprints.some(f=>f.type==='INSTITUTION'&&f.url===r.profileUrl));
    const values=new Set(matches.map(r=>`${r.years}:${Boolean(r.lowerBound)}`));
    if(values.size!==1)return {...p,experienceReview:matches.length?'CONFLICTING_REPORTED_EXPERIENCE':null};
    const r=matches[0];
    const reported=`${r.years}${r.lowerBound?'+':''} years`;
    const estimated=r.sourceKind==='HOSPITAL_PRACTICE_START_ESTIMATE';
    const professional=['PROFESSIONAL_BIOGRAPHY','AUTHOR_BIOGRAPHY'].includes(r.sourceKind);
    const provenance=estimated?'Practice-start estimate':professional?'Source reported':'Hospital reported';
    const experience={minYears:r.years,maxYears:r.lowerBound?null:r.years,useReportedMinimum:Boolean(r.lowerBound),label:`${reported} · ${provenance}`,url:r.sourceUrl,
      sourceKind:r.sourceKind||null,
      profileUrl:r.profileUrl,observedOn:r.checkedAt,asReported:r.asReported||null,
      sourceLocator:r.sourceLocator||null,sourceHash:r.sha256||null,
      sourceAccessStatus:r.sourceAccessStatus||'PAGE_CHECKED',accessNote:r.accessNote||null,
      supportingClaims:r.supportingClaims||[],competingClaims:r.competingClaims||[],scopeReview:r.scopeReview||null,
      basis:`${estimated?`${reported} estimated from the practice start stated by ${r.publisher}`:`${r.publisher} reports ${reported} of experience`}. ${r.accessNote?`${r.accessNote} `:''}${r.scopeReview?.basis?`${r.scopeReview.basis} `:''}${r.lowerBound?'Tier uses the supported minimum; actual experience may fall in a higher band. ':''}Provisional experience tier; not medical registration verification.`,status:'HOSPITAL_REPORTED'};
    const classification=classifyExperience({...p,experience});
    return {...p,experience,tier:classification?.label||'Awaiting classification',classificationStatus:classification?.status||'NOT_ESTABLISHED'};
  });
}
