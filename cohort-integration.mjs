const key = name => name.toLowerCase().replace(/\b(?:dr|prof|professor)\b/g,'').replace(/[^a-z]/g,'');

export function integrateCohort(existing, cohort) {
  const profiles = [], review = [], legacyLinks = [];
  for (const p of cohort.doctors) {
    const matches=existing.filter(old=>[old.name,...(old.aliases||[])].some(n=>key(n)===key(p.name)));
    const linked=matches.filter(old=>old.footprints.some(r=>r.type==='INSTITUTION'&&p.profile_urls.includes(r.url)) ||
      (p.institutions.some(i=>(old.affiliation||'').toLowerCase().includes(i.toLowerCase())) && p.specialties.some(s=>(old.specialty||'').toLowerCase().includes(s.toLowerCase()))));
    const legacy=linked.length===1?linked[0]:null;
    if(legacy)legacyLinks.push({legacyId:legacy.id,cohortId:p.cohort_id,basis:'Exact normalized name plus shared institutional profile or institution and specialty',sourceUrls:p.profile_urls});
    else if(matches.length)review.push({cohortId:p.cohort_id,name:p.name,reason:'Name overlap lacks independent professional corroboration.'});
    profiles.push({
      id:p.cohort_id,name:p.name,specialties:p.specialties,specialty:p.specialties.join(' · '),specialtyReview:p.specialtyReview||null,
      affiliation:p.institutions.join(' · '),city:'Not verified',state:'Not verified',region:'Not verified',
      locationsAsReported:p.locations_as_reported,qualifications:p.qualifications_as_reported,legacyId:legacy?.id||null,
      tier:'Awaiting classification',matchConfidence:null,aliases:[],sourceConfirmed:true,
      registryVerified:false,identityStatus:p.status,experience:null,
      footprints:p.evidence.map((r,i)=>({id:`${p.cohort_id}-${i}`,type:'INSTITUTION',
        title:r.role||'Hospital directory profile',summary:[r.specialty_as_listed,r.qualifications,r.city_as_listed].filter(Boolean).join(' · '),
        publisher:r.publisher,date:r.checked_at.slice(0,10),checkedAt:r.checked_at,
        confidence:'SOURCE_CONFIRMED',url:r.profile_url,sourceUrl:r.source_url,sourceId:r.source_id,sourceLocator:r.source_locator}))
    });
    if(legacy){
      const result=profiles.at(-1);
      Object.assign(result,{city:legacy.city,state:legacy.state,region:legacy.region,aliases:legacy.aliases||[]});
      const urls=new Set(result.footprints.map(e=>e.url));
      result.footprints.push(...legacy.footprints.filter(e=>!urls.has(e.url)));
    }
  }
  return {profiles,review,legacyLinks,externalProfiles:existing.filter(p=>!legacyLinks.some(l=>l.legacyId===p.id))};
}

export function researchMetadata(cohort, review) {
  return {researchedAt:cohort.generatedAt,method:'Primary-source professional profiles. Source confirmation is not medical registration verification. Unknown experience and geography remain unverified.',
    cohort:cohort.summary,legacyOverlapReview:review,limitations:cohort.limitations};
}
