function urlKey(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;return `${u.origin}${u.pathname.replace(/\/+$/,'')}`;}catch{return null;}
}

export function resolveArticleDiscovery(cohort,collection){
  if(collection.cohortHash!==cohort.checksum)throw Error('Article discovery cohort checksum mismatch');
  const people=cohort.doctors,byId=new Map(people.map(p=>[p.cohort_id,p]));
  const pages=new Map(),articles=new Map(),seenArticles=new Set(),review=[];
  for(const page of collection.profiles){
    const person=byId.get(page.cohortId),key=urlKey(page.url);
    if(!person||!key||!person.profile_urls.some(u=>urlKey(u)===key))throw Error('Unknown article-discovery profile');
    const identity=`${page.cohortId}|${key}`;
    if(pages.has(identity))throw Error('Duplicate article-discovery profile');
    pages.set(identity,page);
  }
  for(const article of collection.articles){
    const key=urlKey(article.url);
    if(!key)throw Error('Invalid article URL');
    if(seenArticles.has(key))throw Error('Duplicate article URL');
    seenArticles.add(key);
    const links=[];
    for(const backlink of article.profileBacklinks||[]){
      const page=pages.get(`${backlink.cohortId}|${urlKey(backlink.profileUrl)}`);
      if(!page||page.status!=='PAGE_CHECKED'||!page.articleLinks.some(u=>urlKey(u)===key))throw Error('Article missing checked hospital backlink');
      if(new URL(page.url).origin!==new URL(article.url).origin)throw Error('Cross-origin hospital article');
      if(!links.some(l=>l.cohortId===backlink.cohortId&&l.url===page.url))links.push({cohortId:backlink.cohortId,url:page.url,checkedAt:page.checkedAt,sha256:page.sha256});
    }
    if(!links.length)throw Error('Article without profile provenance');
    const parsed=new URL(article.url);
    if(parsed.hostname==='www.kauveryhospital.com'&&['/news-events/press-releases','/news-events/vaazhga-nalamudan'].includes(parsed.pathname.replace(/\/+$/,''))){
      review.push({url:article.url,reason:'HOSPITAL_NAVIGATION_EXCLUDED'});continue;
    }
    const issues=new Set(article.reviewIssues||[]);
    const reportedDates=[...new Set((article.articleMetadata||[]).map(m=>typeof m?.datePublishedAsReported==='string'?m.datePublishedAsReported.match(/^\d{4}-\d{2}-\d{2}(?=$|[ T])/)?.[0]:null).filter(Boolean))];
    if(reportedDates.length>1)issues.add('CONFLICTING_PUBLICATION_DATES');
    const shared=new Set(links.map(l=>l.cohortId)).size>1;
    if(shared)issues.add('SHARED_PROFILE_LINK_REQUIRES_ATTRIBUTION');
    const excluded=/testimonial|patient (?:success )?(?:stor(?:y|ies)|journey|experience)|success stor(?:y|ies)/i.test(article.title||'');
    if(excluded){review.push({url:article.url,reason:'PATIENT_STORY_EXCLUDED'});continue;}
    articles.set(key,{id:`article:${key}`,url:article.url,title:article.title||'Hospital Article',status:article.status,checkedAt:article.checkedAt||null,sha256:article.sha256||null,
      reviewStatus:'REVIEW_REQUIRED',attributionStatus:'UNVERIFIED',nativePostVerified:false,date:null,dateCandidates:reportedDates,
      reportedMetadata:article.articleMetadata||[],reviewIssues:[...issues],sources:links,shared,
      relationship:'Hospital-linked article; author or reviewer role needs verification'});
  }
  const items=[...articles.values()];
  // Identical untitled responses do not establish that distinct articles were read.
  const uninformativeHashes=new Map();
  for(const article of items){
    if(article.status!=='PAGE_CHECKED'||!article.sha256||article.title!=='Hospital Article'||article.reportedMetadata.length)continue;
    const key=`${new URL(article.url).hostname}|${article.sha256}`;
    const group=uninformativeHashes.get(key)||[];group.push(article);uninformativeHashes.set(key,group);
  }
  for(const group of uninformativeHashes.values())if(group.length>1)for(const article of group){
    article.collectionStatus=article.status;
    article.status='CONTENT_UNCONFIRMED';
    article.reviewIssues.push('REPEATED_UNINFORMATIVE_RESPONSE');
  }
  const doctors=people.map(p=>{
    const checks=[...pages.values()].filter(r=>r.cohortId===p.cohort_id),checked=checks.some(r=>r.status==='PAGE_CHECKED');
    return {cohortId:p.cohort_id,status:checked?'PROFILE_CHECKED':checks.length?'PROFILE_ACCESS_UNAVAILABLE':'NOT_CHECKED',
      pages:checks.map(({url,status,checkedAt})=>({url,status,checkedAt})),candidates:items.filter(a=>!a.shared&&a.sources.some(s=>s.cohortId===p.cohort_id))};
  });
  const counts=Object.fromEntries(['PROFILE_CHECKED','PROFILE_ACCESS_UNAVAILABLE','NOT_CHECKED'].map(s=>[s,doctors.filter(d=>d.status===s).length]));
  return {cohortHash:collection.cohortHash,checkedAt:collection.checkedAt,doctors,articles:items,review,
    summary:{cohortTotal:people.length,counts,articleCandidates:items.length,articlesRead:items.filter(a=>a.status==='PAGE_CHECKED').length,contentUnconfirmed:items.filter(a=>a.status==='CONTENT_UNCONFIRMED').length,
      doctorsWithCandidates:doctors.filter(d=>d.candidates.length).length,sharedArticles:items.filter(a=>a.shared).length,publicationDateConflicts:items.filter(a=>a.reviewIssues.includes('CONFLICTING_PUBLICATION_DATES')).length},limitations:collection.limitations};
}

export function applyArticleReviews(discovery,reviews){
  const byUrl=new Map();
  for(const review of reviews){
    const key=urlKey(review.url);
    if(!key||byUrl.has(key))throw Error('Invalid or duplicate article review');
    if(review.role!=='REVIEWER'||!review.collectionSha256||!review.locator||!review.checkedAt)throw Error('Incomplete article review');
    byUrl.set(key,review);
  }
  const articles=discovery.articles.map(article=>{
    const review=byUrl.get(urlKey(article.url));
    if(!review)return article;
    const current=article.status==='PAGE_CHECKED'&&article.sha256===review.collectionSha256&&
      !article.shared&&article.sources.some(s=>s.cohortId===review.cohortId);
    if(!current)return {...article,reviewIssues:[...new Set([...article.reviewIssues,'MANUAL_REVIEW_REQUIRES_RECHECK'])]};
    return {...article,roleReview:{...review},relationship:review.relationship,
      reviewIssues:[...new Set([...article.reviewIssues,'REVIEWER_CREDIT_NOT_AUTHORSHIP'])]};
  });
  const byId=new Map(articles.map(a=>[a.id,a]));
  return {...discovery,articles,doctors:discovery.doctors.map(d=>({...d,candidates:d.candidates.map(a=>byId.get(a.id))}))};
}

export function enrichArticleProfiles(profiles,discovery){
  const byId=new Map(discovery.doctors.map(d=>[d.cohortId,d]));
  return profiles.map(p=>({...p,articleDiscovery:byId.get(p.id)||null}));
}
