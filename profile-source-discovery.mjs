import {socialSourceKey} from './social-identity.mjs';

function candidate(link){
  let url=link.url;
  try{
    const parsed=new URL(url);
    if(link.platform==='YouTube'&&['www.youtube.com','youtube.com','www.youtube-nocookie.com','youtube-nocookie.com'].includes(parsed.hostname)){
      const id=parsed.pathname.match(/^\/embed\/([\w-]{11})$/)?.[1];
      if(id)url=`https://www.youtube.com/watch?v=${id}`;
    }
  }catch{return null;}
  const contentKey=socialSourceKey(url,link.platform,true),accountKey=socialSourceKey(url,link.platform);
  if(!contentKey&&!accountKey)return null;
  return {...link,url,key:contentKey||accountKey,kind:contentKey?'CONTENT':'ACCOUNT'};
}

export function resolveProfileDiscovery(people,collection){
  const ids=new Set(people.map(p=>p.cohort_id));
  const rows=collection.profiles.filter(p=>ids.has(p.cohortId));
  const links=rows.filter(p=>p.status==='PAGE_CHECKED').flatMap(p=>(p.links||[]).map(l=>({row:p,link:candidate(l)})).filter(x=>x.link));
  const owners=new Map();
  for(const {row,link} of links){if(!owners.has(link.key))owners.set(link.key,new Set());owners.get(link.key).add(row.cohortId);}
  const byDoctor=new Map();
  for(const person of people){
    const pages=rows.filter(r=>r.cohortId===person.cohort_id),unique=new Map();
    let sharedLinksExcluded=0;
    for(const {row,link} of links.filter(x=>x.row.cohortId===person.cohort_id)){
      if(owners.get(link.key).size>1){sharedLinksExcluded++;continue;}
      const existing=unique.get(link.key);
      const evidence={url:row.url,checkedAt:row.checkedAt,sha256:row.sha256,locator:link.locator};
      if(existing){
        if(!existing.sources.some(s=>s.url===evidence.url&&s.locator===evidence.locator))existing.sources.push(evidence);
        if(!existing.title&&link.title)existing.title=link.title;
        continue;
      }
      unique.set(link.key,{id:link.key,url:link.url,platform:link.platform,kind:link.kind,title:link.title||null,
        dateAsReported:link.dateAsReported||null,relationship:link.kind==='CONTENT'?'Hospital-linked content; clinician participation needs review':'Account candidate; ownership needs review',
        reviewStatus:'REVIEW_REQUIRED',nativePostVerified:false,sources:[evidence]});
    }
    byDoctor.set(person.cohort_id,{cohortId:person.cohort_id,pages:pages.map(({url,status,checkedAt,robotsUrl})=>({url,status,checkedAt,robotsUrl})),
      pageChecked:pages.some(r=>r.status==='PAGE_CHECKED'),candidates:[...unique.values()],sharedLinksExcluded});
  }
  const doctors=[...byDoctor.values()];
  return {generatedAt:collection.generatedAt,cohortHash:collection.cohortHash,summary:{cohortTotal:people.length,
    doctorsWithPageChecks:doctors.filter(d=>d.pageChecked).length,doctorsWithCandidates:doctors.filter(d=>d.candidates.length).length,
    candidates:doctors.reduce((n,d)=>n+d.candidates.length,0),sharedLinkOccurrencesExcluded:doctors.reduce((n,d)=>n+d.sharedLinksExcluded,0)},
    doctors,limitations:collection.limitations};
}

export function enrichDiscoveryProfiles(profiles,discovery){
  const byId=new Map(discovery.doctors.map(d=>[d.cohortId,d]));
  return profiles.map(p=>({...p,sourceDiscovery:byId.get(p.id)||null}));
}
