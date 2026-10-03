import { EXPERIENCE_TIERS } from './experience.mjs';
import {classifyExperience} from './reported-experience.mjs';
import {statementSourceKey} from './statement-quality.mjs';
export const personaGroups=[
  {id:'Trailblazers',name:'Trailblazers',description:'35+ years · Enduring authority',color:'#172b50'},
  {id:'Trendsetters',name:'Trendsetters',description:'25–34 years · Established experience',color:'#b94e08'},
  {id:'Rising Stars',name:'Rising Stars',description:'18–24 years · Experienced voices',color:'#7342b5'},
  {id:'Early Sparks',name:'Early Sparks',description:'Under 10 years · Getting noticed',color:'#9163c4'},
  {id:'Frontline Fair',name:'Frontline Fair',description:'10–17 years · Frontline experience',color:'#b51f79'}
];
export function visibleProfileCohort(profiles){
  return profiles.filter(p=>!p.candidate&&personaGroups.some(g=>inPersonaGroup(p,g.id)));
}
// Lower-bound experience is sufficient for 35+, but cannot prove an upper-bounded band.
export const experienceSources={
  'kol-anoop-misra':{minYears:45,maxYears:null,label:'45+ years reported',url:'https://www.anoopmisra.com/about/',basis:'Professional biography reports 45+ years of experience.',observedOn:'2026-09-28'},
  'kol-ambrish-mithal':{minYears:37,maxYears:null,label:'At least 37 years documented',url:'https://www.maxhealthcare.in/international/en/doctor/dr-ambrish-mithal',basis:'Endocrinology faculty work documented from 1988. Conservative completed-year lower bound as of September 2026; not total career length.',observedOn:'2026-09-28'},
  'kol-v-mohan':{minYears:35,maxYears:null,label:'At least 35 years documented',url:'https://drmohans.com/dr-mohans-diabetes-specialities-centre/',basis:'Institution documents 35 years of the centre founded by V Mohan. Lower bound on clinical leadership, not total career length.',observedOn:'2026-09-28'}
};
export function classifyPersona(profile,now=new Date()){
  return classifyExperience(profile,now)?.label || 'Awaiting classification';
}
export function uniqueRecords(records){return [...new Map(records.map(x=>[x.url||x.id,x])).values()]}
export function buildPersonas(people,candidates=[],intelligence=[],listening=[]){
  const known=new Set(people.map(x=>x.openAlexId).filter(Boolean));
  const byId=new Map(intelligence.map(p=>[p.hcp_id,p]));
  const resolved=people.map(p=>{
    const signals=byId.get(p.id),tier=!p.roleReview&&signals?.verification_status==='VERIFIED'?EXPERIENCE_TIERS.find(t=>t.id===signals.experience_tier):null;
    const experience=tier?{label:`${signals.years_of_experience} years since medical registration`,url:signals.registration_source_url,basis:'Calendar-year experience anchored to verified basic medical registration.'}:p.experience||experienceSources[p.id];
    const captured=listening.filter(r=>r.cohortIds?.includes(p.id));
    const records=captured.map(r=>({id:r.id,url:r.sourceEvidence.url,type:'LISTENING',title:`${r.who} · ${r.source}`,summary:r.text,date:r.date,publisher:r.sourceEvidence.publisher||null,channel:r.channel||null,confidence:r.sourceEvidence.check==='page'?'SOURCE_CONFIRMED':'REVIEW',
      sourceCheck:r.sourceEvidence.check||null,paraphrased:r.paraphrased??null,attributionType:r.attributionType||null,attributionNote:r.attributionNote||null,
      clinicalFindingsAppraised:r.clinicalFindingsAppraised??null,sponsorship:r.sponsorship||r.sourceEvidence.sponsorship||null,dateBasis:r.dateBasis||null}));
    const classification=classifyExperience({...p,experience});
    return {...p,experience,intelligence:signals,classificationStatus:tier?'REGISTRY_VERIFIED':classification?.status||'NOT_ESTABLISHED',listeningActivities:new Set(captured.map(r=>statementSourceKey(r.sourceEvidence.url))).size,records:[...uniqueRecords(p.footprints),...records],candidate:false,persona:tier?.label||classification?.label||'Awaiting classification'};
  });
  const discoveries=uniqueRecords(candidates.map(p=>({...p,url:p.openAlexId}))).filter(p=>!known.has(p.openAlexId)).map(p=>({
    id:p.openAlexId,name:p.name,affiliation:p.institutions.join(' · '),city:'Not verified',region:'Not verified',specialty:'Clinical role not verified',candidate:true,
    persona:'Awaiting classification',matchConfidence:null,
    records:uniqueRecords(p.sampleWorks).map((w,i)=>({...w,id:`${p.openAlexId}-${i}`,type:'PUBLICATION',publisher:'OpenAlex discovery',confidence:'REVIEW',summary:'Candidate author association; clinical role and identity require review.'}))
  }));
  return [...resolved,...discoveries];
}
export function inPersonaGroup(p,group){return group==='all'||(group==='review'?p.persona==='Awaiting classification':p.persona===group)}
export function profileLocationLabel(p){
  const known=value=>typeof value==='string'&&value.trim()&&!/^(not verified|unknown|not established)$/i.test(value.trim());
  const reported=(p.locationsAsReported||[]).filter(known).map(value=>value.trim());
  return [...new Set(reported)].join(' · ')||(known(p.city)?p.city.trim():'Location not established');
}
export function regionSummary(people){
  const regions=new Map();let unknown=0;
  for(const p of people){const value=p.region?.trim();if(!value||/^(not verified|unknown|not established)$/i.test(value)){unknown++;continue;}regions.set(value,(regions.get(value)||0)+1);}
  return {count:regions.size,entries:[...regions],unknown};
}
export function countRecords(records){return Object.entries(records.reduce((a,r)=>{a[r.type]=(a[r.type]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1])}
export function pageItems(items,page,size=6){const pages=Math.max(1,Math.ceil(items.length/size)),current=Math.max(0,Math.min(page,pages-1));return {items:items.slice(current*size,(current+1)*size),page:current,pages,total:items.length}}
