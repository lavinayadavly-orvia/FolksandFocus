import { verifiedExperience, EXPERIENCE_TIERS } from './experience.mjs';
export const personaGroups=[
  {id:'Trailblazers',name:'Trailblazers',description:'35+ years · Enduring authority',color:'#303943'},
  {id:'Trendsetters',name:'Trendsetters',description:'25–34 years · Established experience',color:'#087f91'},
  {id:'Rising Stars',name:'Rising Stars',description:'18–24 years · Experienced voices',color:'#315bc3'},
  {id:'Early Sparks',name:'Early Sparks',description:'Under 10 years · Getting noticed',color:'#936425'},
  {id:'Frontline Fair',name:'Frontline Fair',description:'10–17 years · Frontline experience',color:'#93536b'}
];
// Lower-bound experience is sufficient for 35+, but cannot prove an upper-bounded band.
export const experienceSources={
  'kol-anoop-misra':{minYears:45,maxYears:null,label:'45+ years reported',url:'https://www.anoopmisra.com/about/',basis:'Professional biography reports 45+ years of experience.',observedOn:'2026-09-28'},
  'kol-ambrish-mithal':{minYears:37,maxYears:null,label:'At least 37 years documented',url:'https://www.maxhealthcare.in/international/en/doctor/dr-ambrish-mithal',basis:'Endocrinology faculty work documented from 1988. Conservative completed-year lower bound as of September 2026; not total career length.',observedOn:'2026-09-28'},
  'kol-v-mohan':{minYears:35,maxYears:null,label:'At least 35 years documented',url:'https://drmohans.com/dr-mohans-diabetes-specialities-centre/',basis:'Institution documents 35 years of the centre founded by V Mohan. Lower bound on clinical leadership, not total career length.',observedOn:'2026-09-28'}
};
export function classifyPersona(profile,now=new Date()){
  return verifiedExperience(profile,now)?.label || 'Awaiting classification';
}
export function uniqueRecords(records){return [...new Map(records.map(x=>[x.url||x.id,x])).values()]}
export function buildPersonas(people,candidates=[],intelligence=[]){
  const known=new Set(people.map(x=>x.openAlexId).filter(Boolean));
  const byId=new Map(intelligence.map(p=>[p.hcp_id,p]));
  const resolved=people.map(p=>{
    const signals=byId.get(p.id),tier=signals?.verification_status==='VERIFIED'?EXPERIENCE_TIERS.find(t=>t.id===signals.experience_tier):null;
    const experience=tier?{label:`${signals.years_of_experience} years since medical registration`,url:signals.registration_source_url,basis:'Calendar-year experience anchored to verified basic medical registration.'}:p.experience||experienceSources[p.id];
    return {...p,experience,intelligence:signals,records:uniqueRecords(p.footprints),candidate:false,persona:tier?.label||classifyPersona(p)};
  });
  const discoveries=uniqueRecords(candidates.map(p=>({...p,url:p.openAlexId}))).filter(p=>!known.has(p.openAlexId)).map(p=>({
    id:p.openAlexId,name:p.name,affiliation:p.institutions.join(' · '),city:'Not verified',region:'Not verified',specialty:'Clinical role not verified',candidate:true,
    persona:'Awaiting classification',matchConfidence:null,
    records:uniqueRecords(p.sampleWorks).map((w,i)=>({...w,id:`${p.openAlexId}-${i}`,type:'PUBLICATION',publisher:'OpenAlex discovery',confidence:'REVIEW',summary:'Candidate author association; clinical role and identity require review.'}))
  }));
  return [...resolved,...discoveries];
}
export function inPersonaGroup(p,group){return group==='all'||(group==='review'?p.persona==='Awaiting classification':p.persona===group)}
export function countRecords(records){return Object.entries(records.reduce((a,r)=>{a[r.type]=(a[r.type]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1])}
export function pageItems(items,page,size=6){const pages=Math.max(1,Math.ceil(items.length/size)),current=Math.max(0,Math.min(page,pages-1));return {items:items.slice(current*size,(current+1)*size),page:current,pages,total:items.length}}
