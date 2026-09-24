import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { audits, evidence, hcps, researchProfiles, safetyCases } from "./data.mjs";
import { openAlexDiscovery } from "./generated/openalex-discovery.mjs";
import { cohortDiscovery } from "./generated/cohort-discovery.mjs";
import { caseCompleteness, transitionCase } from "./domain.mjs";

const root=fileURLToPath(new URL(".",import.meta.url));
const port=Number(process.env.PORT||4174);
const cases=safetyCases.map(x=>({...x}));
const auditLog=audits.map(x=>({...x}));
const json=(res,status,payload)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(payload))};
const body=req=>new Promise((resolve,reject)=>{let value="";req.on("data",chunk=>{value+=chunk;if(value.length>1e6)reject(new Error("Payload too large"))});req.on("end",()=>{try{resolve(value?JSON.parse(value):{})}catch(error){reject(error)}})});
const scored=()=>researchProfiles.map(person=>{const verified=person.footprints.filter(item=>item.confidence==="VERIFIED").length;const sourceTypes=new Set(person.footprints.map(item=>item.type)).size;return{id:person.id,name:person.name,specialty:person.specialty,city:person.city,institution:person.affiliation,credentials:"Public-source identity dossier",registry:"Not collected",verification:person.matchConfidence>=95?"VERIFIED":"REVIEW",focus:`${person.region} India · ${person.tier}`,movement:0,scorecard:{score:person.footprints.length,confidence:person.matchConfidence,components:{identityMatch:person.matchConfidence,verifiedSources:verified,sourceBreadth:sourceTypes},evidenceCount:person.footprints.length,acceptedEvidence:verified,modelVersion:"dossier-1"}}}).sort((a,b)=>b.scorecard.score-a.scorecard.score);

function overview(){
  const leaders=scored(),sources=researchProfiles.flatMap(person=>person.footprints),verified=sources.filter(item=>item.confidence==="VERIFIED");
  const byType=type=>sources.filter(item=>item.type===type).length;
  return {generatedAt:new Date().toISOString(),headline:"The current workspace contains a source-backed Pan-India expert map.",summary:"Every visible person is linked to named public sources. Topic trends, claim-level evidence, social listening and safety cases remain empty until a real ingestion pipeline supplies reviewable records.",confidence:Math.round(researchProfiles.reduce((sum,item)=>sum+item.matchConfidence,0)/researchProfiles.length),confidenceNote:"Confidence represents identity matching, not clinical influence",tags:["Five regions","Public provenance","No synthetic records"],metrics:[{label:"Mapped experts",value:researchProfiles.length,detail:"Named public-source dossiers"},{label:"Verified sources",value:verified.length,detail:`${sources.length-verified.length} record requires review`},{label:"Regions",value:new Set(researchProfiles.map(item=>item.region)).size,detail:"North, South, East, West, Central"},{label:"Cities",value:new Set(researchProfiles.map(item=>item.city)).size,detail:"Current evidence-backed footprint"}],leaders:leaders.slice(0,4),attention:[{severity:"info",title:"No live listening connector configured",detail:"Trend and narrative panels stay empty until ingestion is connected.",time:"Open"},{severity:"watch",title:"One source record requires confirmation",detail:"It is excluded from verified-source totals.",time:"1"}],themes:[],themeLabels:[],sources:[{name:"Institutional profiles",coverage:byType("INSTITUTION"),state:"Source records"},{name:"Publications",coverage:byType("PUBLICATION"),state:"Source records"},{name:"Conference programmes",coverage:byType("CONFERENCE"),state:"Source records"},{name:"Professional social",coverage:byType("SOCIAL"),state:"Source records"}]};
}

async function api(req,res,url){
  if(req.method==="GET"&&url.pathname==="/api/overview")return json(res,200,overview());
  if(req.method==="GET"&&url.pathname==="/api/hcps")return json(res,200,{items:scored(),modelVersion:"2.3"});
  if(req.method==="GET"&&url.pathname==="/api/research")return json(res,200,{items:researchProfiles,method:"Public-source records are identity-resolved before inclusion; poster and abstract records retain a review state when event-level confirmation is incomplete.",researchedAt:"2026-09-24"});
  if(req.method==="GET"&&url.pathname==="/api/discovery")return json(res,200,openAlexDiscovery);
  if(req.method==="GET"&&url.pathname==="/api/candidates")return json(res,200,cohortDiscovery);
  if(req.method==="GET"&&url.pathname==="/api/evidence")return json(res,200,{items:evidence});
  if(req.method==="GET"&&url.pathname==="/api/safety-cases")return json(res,200,{items:cases.map(x=>({...x,completeness:caseCompleteness(x)}))});
  if(req.method==="POST"&&/^\/api\/safety-cases\/[^/]+\/transition$/.test(url.pathname)){try{const id=url.pathname.split("/")[3],index=cases.findIndex(x=>x.id===id);if(index<0)return json(res,404,{error:"Case not found"});const input=await body(req);cases[index]=transitionCase(cases[index],input.status);auditLog.unshift({at:new Date().toISOString(),actor:"Workspace reviewer",action:`Transitioned case to ${input.status}`,record:id});return json(res,200,{...cases[index],completeness:caseCompleteness(cases[index])})}catch(error){return json(res,409,{error:error.message})}}
  if(req.method==="POST"&&url.pathname==="/api/scoring/recompute")return json(res,200,{items:scored(),generatedAt:new Date().toISOString()});
  if(req.method==="GET"&&url.pathname==="/api/governance")return json(res,200,{weights:{},guardrails:[{title:"Source-backed records only",detail:"People and activities require a resolvable public source before display."},{title:"No inferred influence",detail:"Source volume and identity confidence are never presented as clinical influence."},{title:"Review state is explicit",detail:"Unconfirmed poster, abstract and publication records remain marked for review."},{title:"No synthetic safety data",detail:"The safety desk remains empty until an authorised case source is connected."}],audits:auditLog.slice(0,20)});
  return false;
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8"};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost");if(url.pathname.startsWith("/api/")){const handled=await api(req,res,url);if(handled!==false)return;return json(res,404,{error:"Endpoint not found"})}const requested=url.pathname==="/"?"index.html":url.pathname.slice(1);if(requested.includes(".."))return json(res,400,{error:"Invalid path"});const file=await readFile(join(root,requested));res.writeHead(200,{"content-type":mime[extname(requested)]||"application/octet-stream"});res.end(file)}catch(error){if(error.code==="ENOENT")return json(res,404,{error:"Not found"});json(res,500,{error:"Unexpected server error"})}}).listen(port,"127.0.0.1",()=>console.log(`FolksandFocus listening on http://127.0.0.1:${port}`));
