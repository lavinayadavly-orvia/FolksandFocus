import {publicationDate} from './publication-resolution.mjs';

export function publicationAnalytics(people,collection,group='all'){
 const members=people.filter(p=>group==='all'||p.persona===group),byId=new Map(members.map(p=>[p.id,p]));
 const authors=new Map();
 for(const link of collection.links||[]){
  if(link.status!=='SOURCE_CORROBORATED'||!byId.has(link.cohortId))continue;
  if(!authors.has(link.publicationId))authors.set(link.publicationId,new Map());
  authors.get(link.publicationId).set(link.cohortId,byId.get(link.cohortId));
 }
 const records=[...new Map((collection.publications||[]).map(p=>[p.id,p])).values()].filter(p=>authors.has(p.id)).map(p=>{
  // PubMed also uses this field for funding and indexing tags, not paper formats.
  const types=[...new Set(p.publicationTypes||[])].filter(t=>!/^Research Support\b|^English Abstract$|^MedlinePlus Patient Education Handout$/i.test(t));
  const specific=types.filter(t=>t!=='Journal Article');
  return {...p,date:publicationDate(p),doctors:[...authors.get(p.id).values()],types:specific.length?specific:types.length?types:['Unspecified']};
 }).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.title.localeCompare(b.title));
 const types=[...new Set(records.flatMap(p=>p.types))].map(label=>({label,records:records.filter(p=>p.types.includes(label))})).map(t=>({...t,count:t.records.length})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
 return {records,types,doctors:new Set(records.flatMap(r=>r.doctors.map(p=>p.id))).size,total:records.length};
}
