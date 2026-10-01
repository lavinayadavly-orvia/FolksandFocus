import {socialSourceKey} from './social-identity.mjs';

export function sanitizeVideoMetadata(data){
  if(data?.provider_name!=='YouTube'||data.type!=='video'||typeof data.title!=='string'||!data.title.trim()||typeof data.author_name!=='string'||!socialSourceKey(data.author_url,'YouTube'))throw Error('Invalid YouTube metadata');
  return {title:data.title.trim().slice(0,500),publisher:data.author_name.trim().slice(0,200),publisherUrl:data.author_url};
}
export const isPatientStoryTitle=title=>/testimonial|patient (?:success )?(?:stor(?:y|ies)|feedback|experience|journey)|success stor(?:y|ies)/i.test(title||'');

const nameWords=value=>String(value||'').toLowerCase().replace(/\(gp capt\)|\b(?:dr|prof|professor)\b/g,' ').replace(/[^a-z ]/g,' ').split(/\s+/).filter(w=>w.length>1);
export function titleNamesDoctor(title,doctor,people,sources){
  if(!sources?.some(s=>doctor.profile_urls?.includes(s.url)))return false;
  const text=` ${nameWords(title).join(' ')} `;
  const matches=people.filter(p=>{const parts=nameWords(p.name);return parts.length>=2&&text.includes(` ${parts.join(' ')} `)});
  return matches.length===1&&matches[0].cohort_id===doctor.cohort_id;
}

export function enrichVideoDiscovery(discovery,collection,people=[]){
  if(collection.cohortHash!==discovery.cohortHash)throw Error('Video metadata cohort mismatch');
  const records=new Map();
  for(const record of collection.records){
    if(socialSourceKey(record.url,'YouTube',true)!==record.id||records.has(record.id))throw Error('Invalid or duplicate video identity');
    records.set(record.id,record);
  }
  let checked=0,unavailable=0;
  const doctors=discovery.doctors.map(person=>{
    const exclusions=[];
    const candidates=person.candidates.map(candidate=>{
    const record=records.get(candidate.id);
    if(!record)return candidate;
    if(record.status==='EXCLUDED_PATIENT_STORY'){
      checked++;exclusions.push({id:candidate.id,reason:'PATIENT_STORY_NOT_CLINICIAN_COMMENTARY',checkedAt:record.checkedAt});return null;
    }
    const metadata={status:record.status,checkedAt:record.checkedAt,sourceUrl:record.sourceUrl,sha256:record.sha256||null};
    if(record.status!=='METADATA_CHECKED'){unavailable++;return {...candidate,videoMetadata:metadata};}
    const safe=sanitizeVideoMetadata({provider_name:'YouTube',type:'video',title:record.title,author_name:record.publisher,author_url:record.publisherUrl});
    checked++;
    if(isPatientStoryTitle(safe.title)){
      exclusions.push({id:candidate.id,reason:'PATIENT_STORY_NOT_CLINICIAN_COMMENTARY',checkedAt:record.checkedAt});
      return null;
    }
    return {...candidate,hospitalTitle:candidate.title,title:safe.title,publisher:safe.publisher,publisherUrl:safe.publisherUrl,
      videoMetadata:metadata,titleChanged:!!candidate.title&&candidate.title!==safe.title,contentReviewed:false,
      titleAttribution:people.some(p=>p.cohort_id===person.cohortId&&titleNamesDoctor(safe.title,p,people,candidate.sources))?'NAMED_IN_TITLE':'IDENTITY_REVIEW_REQUIRED'};
    }).filter(Boolean);
    return {...person,candidates,exclusions};
  });
  return {...discovery,doctors,summary:{...discovery.summary,candidatesDiscovered:discovery.summary.candidates,
    candidates:doctors.reduce((n,p)=>n+p.candidates.length,0),doctorsWithCandidates:doctors.filter(p=>p.candidates.length).length,
    titleMatchedVideos:doctors.reduce((n,p)=>n+p.candidates.filter(c=>c.titleAttribution==='NAMED_IN_TITLE').length,0),
    doctorsNamedInVideoTitles:doctors.filter(p=>p.candidates.some(c=>c.titleAttribution==='NAMED_IN_TITLE')).length,
    patientStoriesExcluded:doctors.reduce((n,p)=>n+p.exclusions.length,0),videoMetadataChecked:checked,videoMetadataUnavailable:unavailable,
    videoMetadataPending:discovery.doctors.flatMap(p=>p.candidates).filter(c=>c.platform==='YouTube'&&c.kind==='CONTENT'&&!records.has(c.id)).length},metadataCheckedAt:collection.generatedAt};
}
