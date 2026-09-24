import { mkdir, writeFile } from "node:fs/promises";
import { researchProfiles } from "../data.mjs";

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const normal=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const output=[];

for(const person of researchProfiles){
  const query=encodeURIComponent(person.aliases[0]||person.name);
  const authorResponse=await fetch(`https://api.openalex.org/authors?search=${query}&per-page=10`);
  if(!authorResponse.ok)throw new Error(`OpenAlex author search failed: ${authorResponse.status}`);
  const authors=(await authorResponse.json()).results||[];
  const city=normal(person.city),affiliation=normal(person.affiliation);
  const ranked=authors.map(author=>{
    const institutions=(author.last_known_institutions||[]).map(item=>normal(item.display_name)).join(" ");
    const nameScore=normal(author.display_name)===normal(person.aliases[0]||person.name)?50:25;
    const indiaScore=(author.last_known_institutions||[]).some(item=>item.country_code==="IN")?20:0;
    const affiliationScore=affiliation.split(" ").filter(token=>token.length>4&&institutions.includes(token)).length*5;
    const cityScore=institutions.includes(city)?10:0;
    return{author,score:Math.min(100,nameScore+indiaScore+affiliationScore+cityScore)};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  if(!best||best.score<60){output.push({profileId:person.id,name:person.name,status:"UNRESOLVED",candidates:authors.length});continue}
  const worksResponse=await fetch(`https://api.openalex.org/works?filter=author.id:${best.author.id.split("/").pop()}&sort=publication_date:desc&per-page=10`);
  if(!worksResponse.ok)throw new Error(`OpenAlex works search failed: ${worksResponse.status}`);
  const works=(await worksResponse.json()).results||[];
  output.push({profileId:person.id,name:person.name,status:best.score>=80?"VERIFIED":"REVIEW",matchScore:best.score,openAlexId:best.author.id,worksCount:best.author.works_count,citedByCount:best.author.cited_by_count,orcid:best.author.orcid||null,recentWorks:works.map(work=>({id:work.id,title:work.display_name,date:work.publication_date,type:work.type,citedByCount:work.cited_by_count,doi:work.doi||null,url:work.primary_location?.landing_page_url||work.doi||work.id}))});
  await sleep(120);
}

await mkdir(new URL("../generated/",import.meta.url),{recursive:true});
const generatedAt=new Date().toISOString();
await writeFile(new URL("../generated/openalex-discovery.mjs",import.meta.url),`export const openAlexDiscovery=${JSON.stringify({generatedAt,source:"OpenAlex",profiles:output},null,2)};\n`);
console.log(JSON.stringify({generatedAt,profiles:output.length,resolved:output.filter(item=>item.status!=="UNRESOLVED").length,works:output.reduce((sum,item)=>sum+(item.recentWorks?.length||0),0)}));
