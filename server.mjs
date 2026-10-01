import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { audits, evidence, hcps, researchProfiles, researchInfo, publicationReview, cohortPublications, safetyCases, socialAccounts, socialPosts } from "./data.mjs";
import { openAlexDiscovery } from "./generated/openalex-discovery.mjs";
import { cohortDiscovery } from "./generated/cohort-discovery.mjs";
import { caseCompleteness, transitionCase } from "./domain.mjs";
import { buildSocialMonitor } from "./social-monitor.mjs";
import { buildHcpAuditCard } from "./audit-card.mjs";
import { Readable } from "node:stream";
import { openLocalDatabase } from "./backend/local-database.mjs";
import { IntelligenceStore } from "./backend/store.mjs";
import { intelligenceApi } from "./backend/api.mjs";
import { publicAsset } from "./backend/static-assets.mjs";
import { listeningCohort } from './listening-cohort.mjs';
import { articleDiscovery } from './data.mjs';

const root=fileURLToPath(new URL(".",import.meta.url));
const port=Number(process.env.PORT||4174);
const intelligenceDb=await openLocalDatabase(process.env.INTELLIGENCE_DB_PATH||join(root,"..",".folksandfocus-data","intelligence.sqlite"));
const intelligenceStore=new IntelligenceStore(intelligenceDb);
await intelligenceStore.seedDossiers(researchProfiles);
const cases=safetyCases.map(x=>({...x}));
const auditLog=audits.map(x=>({...x}));
const json=(res,status,payload)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(payload))};
const body=req=>new Promise((resolve,reject)=>{let value="";req.on("data",chunk=>{value+=chunk;if(value.length>1e6)reject(new Error("Payload too large"))});req.on("end",()=>{try{resolve(value?JSON.parse(value):{})}catch(error){reject(error)}})});
const scored=()=>researchProfiles.map(person=>{const verified=person.footprints.filter(item=>item.confidence==="VERIFIED").length;const sourceTypes=new Set(person.footprints.map(item=>item.type)).size;return{id:person.id,name:person.name,specialty:person.specialty,city:person.city,institution:person.affiliation,credentials:"Public-source identity dossier",registry:"Not collected",verification:person.sourceConfirmed?"SOURCE_CONFIRMED":person.matchConfidence>=95?"VERIFIED":"REVIEW",focus:`${person.region} India · ${person.tier}`,movement:0,scorecard:{score:person.footprints.length,confidence:person.matchConfidence,components:{identityMatch:person.matchConfidence,verifiedSources:verified,sourceBreadth:sourceTypes},evidenceCount:person.footprints.length,acceptedEvidence:verified,modelVersion:"dossier-1"}}}).sort((a,b)=>b.scorecard.score-a.scorecard.score);

function overview(){
  const leaders=scored(),sources=researchProfiles.flatMap(person=>person.footprints),verified=sources.filter(item=>item.confidence==="VERIFIED");
  const byType=type=>sources.filter(item=>item.type===type).length;
  return {generatedAt:new Date().toISOString(),headline:"The current workspace contains a source-backed Pan-India expert map.",summary:"Every visible person is linked to named public sources. Topic trends, claim-level evidence, social listening and safety cases remain empty until a real ingestion pipeline supplies reviewable records.",confidence:Math.round(researchProfiles.filter(p=>p.matchConfidence!=null).reduce((sum,item)=>sum+item.matchConfidence,0)/Math.max(1,researchProfiles.filter(p=>p.matchConfidence!=null).length)),confidenceNote:"Identity confidence applies only to assessed legacy dossiers; new cohort matches remain unscored",tags:["Five regions","Public provenance","No synthetic records"],metrics:[{label:"Mapped experts",value:researchProfiles.length,detail:"Named public-source dossiers"},{label:"Verified sources",value:verified.length,detail:`${sources.length-verified.length} record requires review`},{label:"Regions",value:new Set(researchProfiles.filter(p=>p.region!=="Not verified").map(item=>item.region)).size,detail:"North, South, East, West, Central"},{label:"Cities",value:new Set(researchProfiles.filter(p=>p.city!=="Not verified").map(item=>item.city)).size,detail:"Current evidence-backed footprint"}],leaders:leaders.slice(0,4),attention:[{severity:"info",title:"No live listening connector configured",detail:"Trend and narrative panels stay empty until ingestion is connected.",time:"Open"},{severity:"watch",title:"One source record requires confirmation",detail:"It is excluded from verified-source totals.",time:"1"}],themes:[],themeLabels:[],sources:[{name:"Institutional profiles",coverage:byType("INSTITUTION"),state:"Source records"},{name:"Publications",coverage:byType("PUBLICATION"),state:"Source records"},{name:"Conference programmes",coverage:byType("CONFERENCE"),state:"Source records"},{name:"Professional social",coverage:byType("SOCIAL"),state:"Source records"}]};
}

async function api(req,res,url){
  if(url.pathname.startsWith("/api/intelligence/")){
    const request=new Request(url,{method:req.method,headers:req.headers,...(!["GET","HEAD"].includes(req.method)?{body:Readable.toWeb(req),duplex:"half"}:{})});
    const result=await intelligenceApi(request,{store:intelligenceStore,env:process.env});
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
  }
  if(req.method==="GET"&&url.pathname==="/api/overview")return json(res,200,overview());
  if(req.method==="GET"&&url.pathname==="/api/hcps")return json(res,200,{items:scored(),modelVersion:"2.3"});
  if(req.method==="GET"&&url.pathname==="/api/research")return json(res,200,{items:researchProfiles,...researchInfo});
  if(req.method==="GET"&&url.pathname==="/api/publication-review")return json(res,200,publicationReview);
  if(req.method==="GET"&&url.pathname==="/api/publication-collection")return json(res,200,cohortPublications);
  if(req.method==="GET"&&url.pathname==="/api/discovery")return json(res,200,openAlexDiscovery);
  if(req.method==="GET"&&url.pathname==="/api/candidates")return json(res,200,cohortDiscovery);
  if(req.method==="GET"&&url.pathname==="/api/listening-cohort")return json(res,200,listeningCohort);
  if(req.method==="GET"&&url.pathname==="/api/article-discovery")return json(res,200,articleDiscovery);
  if(req.method==="GET"&&url.pathname==="/api/social-monitor")return json(res,200,buildSocialMonitor(listeningCohort.accounts,listeningCohort.posts,researchProfiles));
  if(req.method==="GET"&&/^\/api\/hcps\/[^/]+\/audit-card$/.test(url.pathname)){const id=url.pathname.split("/")[3],person=researchProfiles.find(item=>item.id===id);return person?json(res,200,buildHcpAuditCard(person,socialAccounts,socialPosts)):json(res,404,{error:"HCP not found"})}
  if(req.method==="GET"&&url.pathname==="/api/evidence")return json(res,200,{items:evidence});
  if(req.method==="GET"&&url.pathname==="/api/safety-cases")return json(res,200,{items:cases.map(x=>({...x,completeness:caseCompleteness(x)}))});
  if(req.method==="POST"&&/^\/api\/safety-cases\/[^/]+\/transition$/.test(url.pathname)){try{const id=url.pathname.split("/")[3],index=cases.findIndex(x=>x.id===id);if(index<0)return json(res,404,{error:"Case not found"});const input=await body(req);cases[index]=transitionCase(cases[index],input.status);auditLog.unshift({at:new Date().toISOString(),actor:"Workspace reviewer",action:`Transitioned case to ${input.status}`,record:id});return json(res,200,{...cases[index],completeness:caseCompleteness(cases[index])})}catch(error){return json(res,409,{error:error.message})}}
  if(req.method==="POST"&&url.pathname==="/api/scoring/recompute")return json(res,200,{items:scored(),generatedAt:new Date().toISOString()});
  if(req.method==="GET"&&url.pathname==="/api/governance")return json(res,200,{weights:{},guardrails:[{title:"Source-backed records only",detail:"People and activities require a resolvable public source before display."},{title:"No inferred influence",detail:"Source volume and identity confidence are never presented as clinical influence."},{title:"Review state is explicit",detail:"Unconfirmed poster, abstract and publication records remain marked for review."},{title:"No synthetic safety data",detail:"The safety desk remains empty until an authorised case source is connected."}],audits:auditLog.slice(0,20)});
  return false;
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".png":"image/png"};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost");if(url.pathname.startsWith("/api/")){const handled=await api(req,res,url);if(handled!==false)return;return json(res,404,{error:"Endpoint not found"})}const requested=publicAsset(url.pathname);if(!requested)return json(res,404,{error:"Not found"});const file=await readFile(join(root,requested));res.writeHead(200,{"content-type":mime[extname(requested)]||"application/octet-stream","x-content-type-options":"nosniff"});res.end(file)}catch(error){if(error.code==="ENOENT")return json(res,404,{error:"Not found"});json(res,500,{error:"Unexpected server error"})}}).listen(port,"127.0.0.1",()=>console.log(`DOLytics listening on http://127.0.0.1:${port}`));
