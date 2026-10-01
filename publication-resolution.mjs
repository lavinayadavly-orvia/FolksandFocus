const words=value=>String(value||'').toLowerCase().replace(/\(gp capt\)|\b(?:dr|prof|professor)\b/g,' ').replace(/[^a-z ]/g,' ').trim().split(/\s+/).filter(Boolean);
const nameKey=value=>words(value).join(' ');
const institutionPatterns=[
  ['manipal', /\bmanipal\b.*\b(?:hospital|hospitals)\b/i],
  ['max', /\bmax\b.*\b(?:healthcare|hospital|hospitals)\b/i],
  ['kims', /\b(?:kims|krishna institute of medical sciences)\b.*\b(?:hospital|hospitals|hyderabad|secunderabad)\b/i],
  ['aster', /\baster\b/i], ['medicover', /\bmedicover\b/i], ['medanta', /\bmedanta\b/i],
  ['kauvery', /\bkauvery\b/i], ['care', /\bcare hospitals?\b/i], ['marengo', /\bmarengo\b/i]
];
function institutionMatch(person,affiliation){
  return person.institutions.some(institution=>{
    const key=institutionPatterns.find(([brand])=>new RegExp(`\\b${brand}\\b`,'i').test(institution));
    return key?key[1].test(affiliation):nameKey(affiliation).includes(nameKey(institution));
  });
}
function possibleName(person,author){
  const expected=words(person.name),actual=words(author.name);
  if(expected.length<2||actual.length<2)return false;
  // Initials and abbreviated names are discovery leads, never automatic identity links.
  return expected.at(-1)===actual.at(-1)&&expected[0][0]===actual[0][0];
}
export function publicationDate(record){
  const dates=record.dates||[],date=dates.find(d=>d.basis==='Electronic')||dates[0];
  if(!date?.Year)return null;
  const month=/^\d+$/.test(date.Month||'')?date.Month.padStart(2,'0'):({Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'})[date.Month];
  return date.Year+(month?`-${month}`:'')+(month&&date.Day?`-${date.Day.padStart(2,'0')}`:'');
}
export function resolvePublications(people,collection){
  const links=[],review=[],byName=new Map(),byInitial=new Map();
  for(const p of people){
    const k=nameKey(p.name);byName.set(k,[...(byName.get(k)||[]),p]);
    const parts=words(p.name),initial=`${parts.at(-1)}:${parts[0]?.[0]}`;
    byInitial.set(initial,[...(byInitial.get(initial)||[]),p]);
  }
  const publications=[...new Map(collection.publications.map(p=>[p.id,p])).values()];
  for(const record of publications){
    for(const author of record.authors){
      if(!author.name)continue;
      const exact=byName.get(nameKey(author.name))||[];
      const strong=words(author.name).filter(w=>w.length>1).length>=2;
      const candidates=exact.filter(p=>strong&&author.affiliations.some(a=>institutionMatch(p,a)));
      if(candidates.length===1){
        const person=candidates[0];
        links.push({publicationId:record.id,cohortId:person.cohort_id,authorName:author.name,
          matchedAffiliations:author.affiliations.filter(a=>institutionMatch(person,a)),
          basis:'Exact full name and author-specific hospital affiliation; unique cohort match.',
          status:'SOURCE_CORROBORATED',profileSourceUrls:person.profile_urls,sourceUrl:record.url,checkedAt:record.checkedAt});
      }else{
        const parts=words(author.name),initial=`${parts.at(-1)}:${parts[0]?.[0]}`;
        const possible=exact.length?exact:(byInitial.get(initial)||[]).filter(p=>possibleName(p,author)&&author.affiliations.some(a=>institutionMatch(p,a)));
        if(possible.length)review.push({publicationId:record.id,authorName:author.name,cohortIds:possible.map(p=>p.cohort_id),
          reason:candidates.length>1?'AMBIGUOUS_COHORT_IDENTITY':exact.length?'AFFILIATION_OR_FULL_NAME_UNCONFIRMED':'ABBREVIATED_NAME',status:'REVIEW_REQUIRED'});
      }
    }
  }
  const uniqueLinks=[...new Map(links.map(l=>[`${l.cohortId}:${l.publicationId}`,l])).values()];
  const linkedIds=new Set(uniqueLinks.map(l=>l.publicationId));
  const searchBatches=collection.searches.map((s,i)=>({...s,id:`PUBMED-SEARCH-${i+1}`}));
  const searches=people.map(p=>{
    const search=searchBatches.find(s=>s.cohortIds.includes(p.cohort_id));
    return {cohortId:p.cohort_id,status:search?.status||'SEARCH_FAILED',checkedAt:search?.checkedAt||null,searchId:search?.id||null,
      linkedPublications:uniqueLinks.filter(l=>l.cohortId===p.cohort_id).length,reviewMatches:review.filter(r=>r.cohortIds.includes(p.cohort_id)).length};
  });
  const compactRecord=p=>{
    const names=new Set([...uniqueLinks,...review].filter(l=>l.publicationId===p.id).map(l=>l.authorName));
    return {...p,authorCount:p.authors.length,authors:p.authors.filter(a=>names.has(a.name)),authorsScope:'Cohort-linked or identity-review authors only; full metadata retained in collection archive.'};
  };
  return {generatedAt:collection.generatedAt,window:collection.window,cohortHash:collection.cohortHash,
    summary:{cohortTotal:people.length,searched:searches.filter(s=>s.status==='COMPLETE').length,publicationCandidates:publications.length,
      linkedPublications:linkedIds.size,doctorsWithPublications:new Set(uniqueLinks.map(l=>l.cohortId)).size,authorLinks:uniqueLinks.length,reviewMatches:review.length},
    publications:publications.filter(p=>linkedIds.has(p.id)).map(compactRecord),links:uniqueLinks,review,searches,searchBatches,
    reviewPublications:publications.filter(p=>review.some(r=>r.publicationId===p.id)).map(compactRecord),
    limitations:collection.limitations,providerNotice:collection.providerNotice};
}
export function enrichPublicationProfiles(profiles,collection){
  const byId=new Map(collection.publications.map(p=>[p.id,p]));
  return profiles.map(person=>{
    const records=collection.links.filter(l=>l.cohortId===person.id).map(link=>{
      const p=byId.get(link.publicationId);
      if(!p)throw new Error(`Missing publication ${link.publicationId}`);
      return {id:p.id,type:'PUBLICATION',title:p.title,url:p.url,publisher:`PubMed / ${p.journal}`,date:publicationDate(p),
        checkedAt:p.checkedAt,confidence:'SOURCE_CONFIRMED',summary:'Authorship matched to the hospital-reported clinician. Research findings have not been appraised; this is not a social post.',
        sourceUrl:p.sourceUrl,sourceId:p.id,identityBasis:link.basis,matchedAffiliations:link.matchedAffiliations};
    });
    return {...person,publicationSearch:collection.searches.find(s=>s.cohortId===person.id)||null,
      footprints:[...new Map([...person.footprints,...records].map(r=>[r.url,r])).values()]};
  });
}
