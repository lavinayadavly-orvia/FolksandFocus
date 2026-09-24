import { audits, evidence, hcps, researchProfiles, safetyCases } from "../../data.mjs";
import { calculateInfluenceScore, caseCompleteness, SCORE_WEIGHTS, transitionCase } from "../../domain.mjs";

const cases=safetyCases.map(item=>({...item}));
const auditLog=audits.map(item=>({...item}));
const response=(payload,status=200)=>Response.json(payload,{status,headers:{"cache-control":"no-store"}});
const scored=()=>hcps.map(hcp=>({...hcp,scorecard:calculateInfluenceScore(hcp,evidence)})).sort((a,b)=>b.scorecard.score-a.scorecard.score);

function overview(){
  const leaders=scored();
  const accepted=evidence.filter(item=>item.disposition==="ACCEPTED");
  const open=cases.filter(item=>!["SUBMITTED","DISMISSED"].includes(item.status));
  return {generatedAt:new Date().toISOString(),headline:"Access is accelerating the GLP-1 conversation; clinical leaders are shifting attention to persistence and quality of weight loss.",summary:"The strongest verified voices remain supportive of treatment expansion, while recent high-quality evidence adds explicit guardrails around lean-mass preservation, discontinuation and multidisciplinary selection.",confidence:86,confidenceNote:"High identity confidence; moderate source recency variance",tags:["Access momentum","Persistence risk","Muscle preservation"],metrics:[{label:"Verified experts",value:leaders.filter(item=>item.verification==="VERIFIED").length,detail:"1 identity held for review"},{label:"Accepted evidence",value:accepted.length,detail:`${evidence.length-accepted.length} claims need review`},{label:"Open safety cases",value:open.length,detail:`${open.filter(item=>item.hoursRemaining<8).length} inside 8-hour threshold`},{label:"Model coverage",value:"88%",detail:"Across monitored specialties"}],leaders:leaders.slice(0,4),attention:[{severity:"critical",title:"PV-2048 approaching internal review threshold",detail:"Four minimum criteria detected; reviewer validation required.",time:"5h"},{severity:"watch",title:"Two claims await provenance review",detail:"Social and news extracts cannot affect scores until accepted.",time:"2"},{severity:"info",title:"Diabetology influence increased",detail:"New access-focused congress evidence shifted the 30-day view.",time:"+6.1"}],themes:[{name:"Endocrinology",values:[82,71,88,76,54]},{name:"Diabetology",values:[78,86,65,81,59]},{name:"Bariatric surgery",values:[61,58,89,72,45]},{name:"Internal medicine",values:[55,69,62,57,48]}],themeLabels:["Access","Efficacy","Selection","Safety","Persistence"],sources:[{name:"Guidelines",coverage:96,state:"Current"},{name:"Peer-reviewed",coverage:91,state:"Current"},{name:"Congress",coverage:78,state:"2 transcripts pending"},{name:"Professional social",coverage:64,state:"Manual review required"}]};
}

export async function onRequest({request,params}){
  const path=Array.isArray(params.path)?params.path.join("/"):params.path||"";
  if(request.method==="GET"&&path==="overview")return response(overview());
  if(request.method==="GET"&&path==="hcps")return response({items:scored(),modelVersion:"2.3"});
  if(request.method==="GET"&&path==="research")return response({items:researchProfiles,method:"Public-source records are identity-resolved before inclusion; poster and abstract records retain a review state when event-level confirmation is incomplete.",researchedAt:"2026-09-24"});
  if(request.method==="GET"&&path==="evidence")return response({items:evidence});
  if(request.method==="GET"&&path==="safety-cases")return response({items:cases.map(item=>({...item,completeness:caseCompleteness(item)}))});
  if(request.method==="GET"&&path==="governance")return response({weights:SCORE_WEIGHTS,guardrails:[{title:"Verified identities only",detail:"Unresolved profiles are excluded from peer authority calculations."},{title:"Evidence cannot self-approve",detail:"Model-assisted extracts require a reviewer disposition before affecting scores."},{title:"Reach is capped",detail:"Audience size contributes 10% and cannot outweigh clinical evidence."},{title:"PV remains human-controlled",detail:"Detection creates a potential case only; submission is never automated."}],audits:auditLog.slice(0,20)});
  if(request.method==="POST"&&path==="scoring/recompute"){auditLog.unshift({at:new Date().toISOString(),actor:"Workspace reviewer",action:"Recomputed influence model 2.3",record:`${hcps.length} profiles`});return response({items:scored(),generatedAt:new Date().toISOString()})}
  const transition=path.match(/^safety-cases\/([^/]+)\/transition$/);
  if(request.method==="POST"&&transition){try{const index=cases.findIndex(item=>item.id===transition[1]);if(index<0)return response({error:"Case not found"},404);const input=await request.json();cases[index]=transitionCase(cases[index],input.status);auditLog.unshift({at:new Date().toISOString(),actor:"Workspace reviewer",action:`Transitioned case to ${input.status}`,record:transition[1]});return response({...cases[index],completeness:caseCompleteness(cases[index])})}catch(error){return response({error:error.message},409)}}
  return response({error:"Endpoint not found"},404);
}
