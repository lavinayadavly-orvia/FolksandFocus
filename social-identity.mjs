export function socialSourceKey(value,platform,post=false){
  try{
    const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,''),path=u.pathname.replace(/\/+$/,'');
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    if(platform==='X'&&['x.com','twitter.com','mobile.twitter.com'].includes(host)){
      if(post){const m=path.match(/^\/[^/]+\/status\/(\d+)(?:\/(?:photo|video)\/\d+)?$/);return m?`X:post:${m[1]}`:null;}
      return /^\/[a-z0-9_]{1,15}$/i.test(path)&&!/^\/(home|search|explore|intent|i)$/i.test(path)?`X:account:${path.toLowerCase()}`:null;
    }
    if(platform==='Instagram'&&host==='instagram.com')return post
      ?(/^\/(p|reel|tv)\/[^/]+$/.test(path)?`Instagram:post:${path.split('/').at(-1)}`:null)
      :(/^\/[a-z0-9_.]+$/i.test(path)&&!/^\/(accounts|explore|direct|p|reel|reels)$/i.test(path)?`Instagram:account:${path.toLowerCase()}`:null);
    if(platform==='LinkedIn'&&['linkedin.com','in.linkedin.com'].includes(host)){
      if(post){
        // A headline can contain "activity-2024"; use the final permalink ID, not headline text.
        const id=path.match(/^\/feed\/update\/urn:li:activity:(\d+)$/)?.[1]
          ||path.match(/^\/posts\/[^/]+-activity-(\d+)(?:-[a-z0-9_-]+)?$/i)?.[1];
        return id?`LinkedIn:post:${id}`:null;
      }
      return /^\/in\/[^/]+$/.test(path)?`LinkedIn:account:${path.toLowerCase()}`:null;
    }
    if(platform==='YouTube'&&['youtube.com','m.youtube.com','youtu.be'].includes(host)){
      if(post){const id=host==='youtu.be'?path.slice(1):path==='/watch'?u.searchParams.get('v'):path.match(/^\/(?:shorts|live)\/([^/]+)$/)?.[1];return /^[\w-]{11}$/.test(id||'')?`YouTube:post:${id}`:null;}
      return host!=='youtu.be'&&/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)$/.test(path)?`YouTube:account:${path.startsWith('/@')?path.toLowerCase():path}`:null;
    }
  }catch{}
  return null;
}

function publicationDate(value){
  if(typeof value!=='string')return null;
  const text=value.trim();
  const day=text.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
  const midnight=Date.parse(`${day}T00:00:00Z`);
  if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==day)return null;
  if(text===day)return {days:[day],instant:null};
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(text))return null;
  const instant=Date.parse(text);
  return Number.isFinite(instant)?{days:[day,new Date(instant).toISOString().slice(0,10)],instant}:null;
}

function datesConflict(date,publishedAt){
  const a=publicationDate(date),b=publicationDate(publishedAt);
  if(!a||!b)return false;
  if(a.instant!==null&&b.instant!==null)return a.instant!==b.instant;
  // A supplied calendar date may use the source offset rather than UTC.
  return !a.days.some(day=>b.days.includes(day));
}

export function guardSocialInteractions(rows, accounts){
  const byId=new Map(accounts.map(a=>[a.id,a])), interactions=[],review=[],seen=new Set();
  for(const r of rows){
    const account=byId.get(r.accountId);
    const target=socialSourceKey(r.targetUrl,r.platform,true);
    const observed=publicationDate(r.observedAt);
    if(!account||account.identityStatus!=='VERIFIED'||account.hcpId!==r.hcpId||account.platform!==r.platform
      ||!['LIKE','REPOST','COMMENT'].includes(r.activityType)||!target||!observed
      ||r.reviewStatus!=='VERIFIED'||!r.evidenceUrl||!r.evidenceLocator){
      review.push({id:r.id||null,reason:'UNRESOLVED_INTERACTION_EVIDENCE'});continue;
    }
    let evidence;
    try{evidence=new URL(r.evidenceUrl);if(evidence.protocol!=='https:')throw new Error();}
    catch{review.push({id:r.id||null,reason:'INVALID_INTERACTION_SOURCE'});continue;}
    // A comment needs its own permalink; multiple comments on one post are distinct.
    if(r.activityType==='COMMENT'&&!r.commentId){review.push({id:r.id||null,reason:'MISSING_COMMENT_ID'});continue;}
    if(r.occurredAt!=null&&!publicationDate(r.occurredAt)){review.push({id:r.id||null,reason:'INVALID_INTERACTION_DATE'});continue;}
    const key=[r.hcpId,r.platform,r.activityType,target,r.activityType==='COMMENT'?r.commentId:''].join('|');
    if(seen.has(key))continue;
    seen.add(key);
    interactions.push({id:key,hcpId:r.hcpId,accountId:account.id,platform:r.platform,
      activityType:r.activityType,targetUrl:r.targetUrl,evidenceUrl:evidence.href,evidenceLocator:r.evidenceLocator,
      observedAt:r.observedAt,occurredAt:r.occurredAt??null,reviewStatus:'VERIFIED',
      statementAttribution:false,sentiment:null});
  }
  return {interactions,review};
}

export function guardSocialRecords(accounts,posts,people){
  const ids=new Set(people.map(p=>p.id)),review=[],duplicates=[];
  const reject=(type,r,reason)=>review.push({type,id:r.id||null,hcpId:r.hcpId||null,reason});
  function unique(rows,type){
    const byId=new Map(),byKey=new Map(),conflicts=new Set();
    const postValues=new Map(),publicationDates=new Map(),contentConflicts=new Set();
    const mismatchedHandles=new Set(),dateConflicts=new Set();
    // Check the whole batch before choosing canonical records: order cannot settle ownership.
    for(const r of rows){
      if(type==='ACCOUNT'&&r.handle!=null&&String(r.handle).trim()){
        const path=new URL(r.profileUrl).pathname.replace(/\/+$/,'');
        const expected=['X','Instagram'].includes(r.platform)?path.slice(1)
          :r.platform==='YouTube'&&path.startsWith('/@')?path.slice(2):null;
        if(expected&&String(r.handle).trim().replace(/^@/,'').toLowerCase()!==expected.toLowerCase())mismatchedHandles.add(r.key);
      }
      const identity=type==='ACCOUNT'?r.hcpId:r.accountId;
      const previousId=byId.get(r.id),previousKey=byKey.get(r.key);
      if(previousId&&(previousId.key!==r.key||previousId.identity!==identity)){conflicts.add(r.id);conflicts.add(previousId.id);}
      if(previousKey&&previousKey.identity!==identity){conflicts.add(r.id);conflicts.add(previousKey.id);}
      byId.set(r.id,{...r,identity});byKey.set(r.key,{...r,identity});
      if(type==='POST'){
        const fields=postValues.get(r.key)||new Map();
        const dates=publicationDates.get(r.key)||{date:[],publishedAt:[]};
        dates.date.push(r.date);dates.publishedAt.push(r.publishedAt);
        publicationDates.set(r.key,dates);
        for(const field of ['text','title','publishedAt','date','sentiment']){
          const value=r[field];
          if(value==null||value==='')continue;
          const values=fields.get(field)||new Set();
          let normalized=typeof value==='string'?value.trim():JSON.stringify(value);
          if(field==='sentiment')normalized=normalized.toLowerCase();
          if(['date','publishedAt'].includes(field)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)&&Number.isFinite(Date.parse(normalized)))normalized=new Date(normalized).toISOString();
          values.add(normalized);
          fields.set(field,values);
          if(values.size>1)contentConflicts.add(r.key);
        }
        postValues.set(r.key,fields);
      }
    }
    for(const [key,fields] of publicationDates){
      for(const date of fields.date)for(const timestamp of fields.publishedAt){
        if(datesConflict(date,timestamp))dateConflicts.add(key);
      }
    }
    const badKeys=new Set(rows.filter(r=>conflicts.has(r.id)).map(r=>r.key));
    const kept=[],seen=new Map(),aliases=new Map(),canonicalRecords=new Map();
    for(const r of rows){
      if(conflicts.has(r.id)||badKeys.has(r.key)){reject(type,r,'CONFLICTING_OWNERSHIP');continue;}
      if(mismatchedHandles.has(r.key)){reject(type,r,'PROFILE_HANDLE_MISMATCH');continue;}
      if(contentConflicts.has(r.key)){reject(type,r,'CONFLICTING_POST_CONTENT');continue;}
      if(dateConflicts.has(r.key)){reject(type,r,'CONFLICTING_PUBLICATION_DATES');continue;}
      if(seen.has(r.key)){
        // Conflict checks above make complementary content safe to retain, not engagement snapshots.
        if(type==='POST'){
          const record=canonicalRecords.get(r.key);
          for(const field of ['text','title','publishedAt','date','sentiment']){
            if((record[field]==null||record[field]==='')&&r[field]!=null&&r[field]!=='')record[field]=r[field];
          }
        }
        aliases.set(r.id,seen.get(r.key));duplicates.push({type,id:r.id,canonicalId:seen.get(r.key)});continue;
      }
      seen.set(r.key,r.id);aliases.set(r.id,r.id);const {key,...record}=r;kept.push(record);canonicalRecords.set(key,record);
    }
    return {kept,aliases};
  }
  const candidates=[];
  for(const a of accounts){
    const key=socialSourceKey(a.profileUrl,a.platform);
    if(!a.id||!ids.has(a.hcpId)||a.identityStatus!=='VERIFIED'||!key){reject('ACCOUNT',a,'UNRESOLVED_IDENTITY_OR_INVALID_PROFILE');continue;}
    candidates.push({...a,key});
  }
  const result=unique(candidates,'ACCOUNT'),byId=new Map(result.kept.map(a=>[a.id,a])),postCandidates=[];
  for(const p of posts){
    const a=byId.get(result.aliases.get(p.accountId)),key=socialSourceKey(p.url,p.platform,true);
    if(!p.id||!a||a.hcpId!==p.hcpId||a.platform!==p.platform||p.reviewStatus!=='VERIFIED'||!key){reject('POST',p,'UNRESOLVED_POST_OR_ACCOUNT_MISMATCH');continue;}
    if(p.platform==='X'&&new URL(p.url).pathname.split('/')[1].toLowerCase()!==new URL(a.profileUrl).pathname.split('/')[1].toLowerCase()){
      reject('POST',p,'POST_URL_OWNER_MISMATCH');continue;
    }
    postCandidates.push({...p,accountId:a.id,key});
  }
  return {accounts:result.kept,posts:unique(postCandidates,'POST').kept,review,duplicates};
}
