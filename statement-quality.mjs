function stable(value,key=''){
  if(Array.isArray(value)){
    const items=value.map(v=>stable(v));
    return ['themes','cohortIds','cohortDoctorNames'].includes(key)?items.sort():items;
  }
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>k!=='checkedAt').sort().map(k=>[k,stable(value[k],k)]));
  return value;
}

export function statementSourceKey(value){
  try{
    const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;
    url.hash='';
    for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid'].includes(key.toLowerCase()))url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  }catch{return null;}
}
const normalized=value=>typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
const identity=row=>JSON.stringify([normalized(row.who).toLowerCase(),normalized(row.role).toLowerCase(),normalized(row.specialty).toLowerCase(),row.date,normalized(row.text)]);

// Resolve the entire input before period or archetype filters can hide a conflict.
export function guardStatements(statements,sourceLinks={}){
  const byId=new Map(),conflicts=new Set(),duplicates=[],review=[];
  for(const row of statements){
    if(typeof row?.id!=='string'||!row.id.trim()){
      review.push({id:null,reason:'MISSING_STATEMENT_ID'});continue;
    }
    const fingerprint=JSON.stringify(stable(row));
    const prior=byId.get(row.id);
    if(prior){
      if(prior.fingerprint!==fingerprint)conflicts.add(row.id);
      else duplicates.push({id:row.id,reason:'DUPLICATE_STATEMENT_ID'});
    }else byId.set(row.id,{row,fingerprint});
  }
  for(const id of conflicts)review.push({id,reason:'CONFLICTING_STATEMENT_ID'});
  const groups=new Map();
  for(const row of statements){
    if(!byId.has(row?.id)||!normalized(row.text)||!normalized(row.who))continue;
    const url=statementSourceKey(row.sourceEvidence?.url||sourceLinks[row.source]?.url);
    if(!url)continue;
    const key=JSON.stringify([url,identity(row)]),group=groups.get(key)||[];
    group.push(row);groups.set(key,group);
  }
  // An ID conflict also invalidates copies of either version under other IDs.
  let changed=true;
  while(changed){
    changed=false;
    for(const group of groups.values())if(group.some(r=>conflicts.has(r.id)))for(const row of group)if(!conflicts.has(row.id)){
      conflicts.add(row.id);review.push({id:row.id,reason:'COPY_OF_CONFLICTING_STATEMENT'});changed=true;
    }
  }
  const copies=new Set();
  for(const group of groups.values()){
    const rows=[...new Map(group.map(r=>[r.id,r])).values()].filter(r=>!conflicts.has(r.id)).sort((a,b)=>a.id.localeCompare(b.id));
    if(rows.length<2)continue;
    const signatures=new Set(rows.map(row=>{
      const {id,source,sourceEvidence,who,role,specialty,text,...fields}=row;
      return JSON.stringify(stable({...fields,identity:identity(row),sourceDisclosure:sourceEvidence?.sponsorship||sourceLinks[source]?.sponsorship||null}));
    }));
    if(signatures.size>1){
      for(const row of rows){conflicts.add(row.id);review.push({id:row.id,reason:'CONFLICTING_STATEMENT_CLASSIFICATION'});}
      continue;
    }
    for(const row of rows.slice(1)){
      copies.add(row.id);duplicates.push({id:row.id,canonicalId:rows[0].id,reason:'SAME_SOURCE_STATEMENT_COPY'});
    }
  }
  const kept=[...byId.values()].map(x=>x.row).filter(r=>!conflicts.has(r.id)&&!copies.has(r.id));
  const crossSource=new Map();
  for(const row of kept){
    const url=statementSourceKey(row.sourceEvidence?.url||sourceLinks[row.source]?.url);
    if(!url||normalized(row.text).length<60||!normalized(row.who))continue;
    const key=identity(row),group=crossSource.get(key)||[];group.push({id:row.id,url});crossSource.set(key,group);
  }
  const possibleDuplicates=[...crossSource.values()].filter(g=>new Set(g.map(r=>r.url)).size>1).map(records=>({reason:'MATCHING_TEXT_ACROSS_SOURCES',records}));
  return {statements:kept,review,duplicates:duplicates.filter(r=>!conflicts.has(r.id)),conflicts:[...conflicts],possibleDuplicates};
}
