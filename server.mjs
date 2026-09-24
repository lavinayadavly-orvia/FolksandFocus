import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { audits, evidence, hcps, researchProfiles, safetyCases } from "./data.mjs";
import { calculateInfluenceScore, caseCompleteness, SCORE_WEIGHTS, transitionCase } from "./domain.mjs";

const root=fileURLToPath(new URL(".",import.meta.url));
const port=Number(process.env.PORT||4174);
const cases=safetyCases.map(x=>({...x}));
const auditLog=audits.map(x=>({...x}));
const json=(res,status,payload)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(payload))};
const body=req=>new Promise((resolve,reject)=>{let value="";req.on("data",chunk=>{value+=chunk;if(value.length>1e6)reject(new Error("Payload too large"))});req.on("end",()=>{try{resolve(value?JSON.parse(value):{})}catch(error){reject(error)}})});
const scored=()=>hcps.map(hcp=>({...hcp,scorecard:calculateInfluenceScore(hcp,evidence)})).sort((a,b)=>b.scorecard.score-a.scorecard.score);

function overview(){
  const leaders=scored(),accepted=evidence.filter(x=>x.disposition==="ACCEPTED"),open=cases.filter(x=>!["SUBMITTED","DISMISSED"].includes(x.status));
  return {generatedAt:new Date().toISOString(),headline:"Access is accelerating the GLP-1 conversation; clinical leaders are shifting attention to persistence and quality of weight loss.",summary:"The strongest verified voices remain supportive of treatment expansion, while recent high-quality evidence adds explicit guardrails around lean-mass preservation, discontinuation and multidisciplinary selection.",confidence:86,confidenceNote:"High identity confidence; moderate source recency variance",tags:["Access momentum","Persistence risk","Muscle preservation"],metrics:[{label:"Verified experts",value:leaders.filter(x=>x.verification==="VERIFIED").length,detail:"1 identity held for review"},{label:"Accepted evidence",value:accepted.length,detail:`${evidence.length-accepted.length} claims need review`},{label:"Open safety cases",value:open.length,detail:`${open.filter(x=>x.hoursRemaining<8).length} inside 8-hour threshold`},{label:"Model coverage",value:"88%",detail:"Across monitored specialties"}],leaders:leaders.slice(0,4),attention:[{severity:"critical",title:"PV-2048 approaching internal review threshold",detail:"Four minimum criteria detected; reviewer validation required.",time:"5h"},{severity:"watch",title:"Two claims await provenance review",detail:"Social and news extracts cannot affect scores until accepted.",time:"2"},{severity:"info",title:"Diabetology influence increased",detail:"New access-focused congress evidence shifted the 30-day view.",time:"+6.1"}],themes:[{name:"Endocrinology",values:[82,71,88,76,54]},{name:"Diabetology",values:[78,86,65,81,59]},{name:"Bariatric surgery",values:[61,58,89,72,45]},{name:"Internal medicine",values:[55,69,62,57,48]}],themeLabels:["Access","Efficacy","Selection","Safety","Persistence"],sources:[{name:"Guidelines",coverage:96,state:"Current"},{name:"Peer-reviewed",coverage:91,state:"Current"},{name:"Congress",coverage:78,state:"2 transcripts pending"},{name:"Professional social",coverage:64,state:"Manual review required"}]};
}

async function api(req,res,url){
  if(req.method==="GET"&&url.pathname==="/api/overview")return json(res,200,overview());
  if(req.method==="GET"&&url.pathname==="/api/hcps")return json(res,200,{items:scored(),modelVersion:"2.3"});
  if(req.method==="GET"&&url.pathname==="/api/research")return json(res,200,{items:researchProfiles,method:"Public-source records are identity-resolved before inclusion; poster and abstract records retain a review state when event-level confirmation is incomplete.",researchedAt:"2026-09-24"});
  if(req.method==="GET"&&url.pathname==="/api/evidence")return json(res,200,{items:evidence});
  if(req.method==="GET"&&url.pathname==="/api/safety-cases")return json(res,200,{items:cases.map(x=>({...x,completeness:caseCompleteness(x)}))});
  if(req.method==="POST"&&/^\/api\/safety-cases\/[^/]+\/transition$/.test(url.pathname)){try{const id=url.pathname.split("/")[3],index=cases.findIndex(x=>x.id===id);if(index<0)return json(res,404,{error:"Case not found"});const input=await body(req);cases[index]=transitionCase(cases[index],input.status);auditLog.unshift({at:new Date().toISOString(),actor:"Workspace reviewer",action:`Transitioned case to ${input.status}`,record:id});return json(res,200,{...cases[index],completeness:caseCompleteness(cases[index])})}catch(error){return json(res,409,{error:error.message})}}
  if(req.method==="POST"&&url.pathname==="/api/scoring/recompute"){auditLog.unshift({at:new Date().toISOString(),actor:"Workspace reviewer",action:"Recomputed influence model 2.3",record:`${hcps.length} profiles`});return json(res,200,{items:scored(),generatedAt:new Date().toISOString()})}
  if(req.method==="GET"&&url.pathname==="/api/governance")return json(res,200,{weights:SCORE_WEIGHTS,guardrails:[{title:"Verified identities only",detail:"Unresolved profiles are excluded from peer authority calculations."},{title:"Evidence cannot self-approve",detail:"Model-assisted extracts require a reviewer disposition before affecting scores."},{title:"Reach is capped",detail:"Audience size contributes 10% and cannot outweigh clinical evidence."},{title:"PV remains human-controlled",detail:"Detection creates a potential case only; submission is never automated."}],audits:auditLog.slice(0,20)});
  return false;
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8"};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost");if(url.pathname.startsWith("/api/")){const handled=await api(req,res,url);if(handled!==false)return;return json(res,404,{error:"Endpoint not found"})}const requested=url.pathname==="/"?"index.html":url.pathname.slice(1);if(requested.includes(".."))return json(res,400,{error:"Invalid path"});const file=await readFile(join(root,requested));res.writeHead(200,{"content-type":mime[extname(requested)]||"application/octet-stream"});res.end(file)}catch(error){if(error.code==="ENOENT")return json(res,404,{error:"Not found"});json(res,500,{error:"Unexpected server error"})}}).listen(port,"127.0.0.1",()=>console.log(`FolksandFocus listening on http://127.0.0.1:${port}`));
