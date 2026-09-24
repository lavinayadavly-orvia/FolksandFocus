import { audits, evidence, hcps, researchProfiles, safetyCases } from "../../data.mjs";
import { caseCompleteness, transitionCase } from "../../domain.mjs";

const cases=safetyCases.map(item=>({...item}));
const auditLog=audits.map(item=>({...item}));
const response=(payload,status=200)=>Response.json(payload,{status,headers:{"cache-control":"no-store"}});
const scored=()=>researchProfiles.map(person=>{const verified=person.footprints.filter(item=>item.confidence==="VERIFIED").length;const sourceTypes=new Set(person.footprints.map(item=>item.type)).size;return{id:person.id,name:person.name,specialty:person.specialty,city:person.city,institution:person.affiliation,credentials:"Public-source identity dossier",registry:"Not collected",verification:person.matchConfidence>=95?"VERIFIED":"REVIEW",focus:`${person.region} India · ${person.tier}`,movement:0,scorecard:{score:person.footprints.length,confidence:person.matchConfidence,components:{identityMatch:person.matchConfidence,verifiedSources:verified,sourceBreadth:sourceTypes},evidenceCount:person.footprints.length,acceptedEvidence:verified,modelVersion:"dossier-1"}}}).sort((a,b)=>b.scorecard.score-a.scorecard.score);

function overview(){
  const leaders=scored(),sources=researchProfiles.flatMap(person=>person.footprints),verified=sources.filter(item=>item.confidence==="VERIFIED");
  const byType=type=>sources.filter(item=>item.type===type).length;
  return {generatedAt:new Date().toISOString(),headline:"The current workspace contains a source-backed Pan-India expert map.",summary:"Every visible person is linked to named public sources. Topic trends, claim-level evidence, social listening and safety cases remain empty until a real ingestion pipeline supplies reviewable records.",confidence:Math.round(researchProfiles.reduce((sum,item)=>sum+item.matchConfidence,0)/researchProfiles.length),confidenceNote:"Confidence represents identity matching, not clinical influence",tags:["Five regions","Public provenance","No synthetic records"],metrics:[{label:"Mapped experts",value:researchProfiles.length,detail:"Named public-source dossiers"},{label:"Verified sources",value:verified.length,detail:`${sources.length-verified.length} record requires review`},{label:"Regions",value:new Set(researchProfiles.map(item=>item.region)).size,detail:"North, South, East, West, Central"},{label:"Cities",value:new Set(researchProfiles.map(item=>item.city)).size,detail:"Current evidence-backed footprint"}],leaders:leaders.slice(0,4),attention:[{severity:"info",title:"No live listening connector configured",detail:"Trend and narrative panels stay empty until ingestion is connected.",time:"Open"},{severity:"watch",title:"One source record requires confirmation",detail:"It is excluded from verified-source totals.",time:"1"}],themes:[],themeLabels:[],sources:[{name:"Institutional profiles",coverage:byType("INSTITUTION"),state:"Source records"},{name:"Publications",coverage:byType("PUBLICATION"),state:"Source records"},{name:"Conference programmes",coverage:byType("CONFERENCE"),state:"Source records"},{name:"Professional social",coverage:byType("SOCIAL"),state:"Source records"}]};
}

export async function onRequest({request,params}){
  const path=Array.isArray(params.path)?params.path.join("/"):params.path||"";
  if(request.method==="GET"&&path==="overview")return response(overview());
  if(request.method==="GET"&&path==="hcps")return response({items:scored(),modelVersion:"2.3"});
  if(request.method==="GET"&&path==="research")return response({items:researchProfiles,method:"Public-source records are identity-resolved before inclusion; poster and abstract records retain a review state when event-level confirmation is incomplete.",researchedAt:"2026-09-24"});
  if(request.method==="GET"&&path==="evidence")return response({items:evidence});
  if(request.method==="GET"&&path==="safety-cases")return response({items:cases.map(item=>({...item,completeness:caseCompleteness(item)}))});
  if(request.method==="GET"&&path==="governance")return response({weights:{},guardrails:[{title:"Source-backed records only",detail:"People and activities require a resolvable public source before display."},{title:"No inferred influence",detail:"Source volume and identity confidence are never presented as clinical influence."},{title:"Review state is explicit",detail:"Unconfirmed poster, abstract and publication records remain marked for review."},{title:"No synthetic safety data",detail:"The safety desk remains empty until an authorised case source is connected."}],audits:auditLog.slice(0,20)});
  if(request.method==="POST"&&path==="scoring/recompute")return response({items:scored(),generatedAt:new Date().toISOString()});
  const transition=path.match(/^safety-cases\/([^/]+)\/transition$/);
  if(request.method==="POST"&&transition){try{const index=cases.findIndex(item=>item.id===transition[1]);if(index<0)return response({error:"Case not found"},404);const input=await request.json();cases[index]=transitionCase(cases[index],input.status);auditLog.unshift({at:new Date().toISOString(),actor:"Workspace reviewer",action:`Transitioned case to ${input.status}`,record:transition[1]});return response({...cases[index],completeness:caseCompleteness(cases[index])})}catch(error){return response({error:error.message},409)}}
  return response({error:"Endpoint not found"},404);
}
