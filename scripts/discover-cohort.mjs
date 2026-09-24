import { mkdir, writeFile } from "node:fs/promises";

const searches=["obesity India","type 2 diabetes India","metabolic health India","GLP-1 India"];
const candidates=new Map();

for(const search of searches){
  const url=`https://api.openalex.org/works?search=${encodeURIComponent(search)}&filter=from_publication_date:2021-01-01&sort=cited_by_count:desc&per-page=100`;
  const response=await fetch(url);
  if(!response.ok)throw new Error(`OpenAlex cohort search failed: ${response.status}`);
  const works=(await response.json()).results||[];
  for(const work of works){
    for(const authorship of work.authorships||[]){
      const indianInstitutions=(authorship.institutions||[]).filter(item=>item.country_code==="IN");
      if(!indianInstitutions.length||!authorship.author?.id)continue;
      const id=authorship.author.id;
      const existing=candidates.get(id)||{openAlexId:id,name:authorship.author.display_name,institutions:new Set(),topics:new Set(),sampleWorks:[],sampleCitations:0};
      indianInstitutions.forEach(item=>existing.institutions.add(item.display_name));
      existing.topics.add(search);
      if(existing.sampleWorks.length<5)existing.sampleWorks.push({title:work.display_name,date:work.publication_date,citedByCount:work.cited_by_count,url:work.primary_location?.landing_page_url||work.doi||work.id});
      existing.sampleCitations+=work.cited_by_count||0;
      candidates.set(id,existing);
    }
  }
}

const profiles=[...candidates.values()].map(item=>({...item,institutions:[...item.institutions],topics:[...item.topics]})).sort((a,b)=>b.sampleCitations-a.sampleCitations).slice(0,250);
await mkdir(new URL("../generated/",import.meta.url),{recursive:true});
const payload={generatedAt:new Date().toISOString(),source:"OpenAlex",method:"India-affiliated authors found in recent obesity, diabetes, metabolic-health and GLP-1 literature; candidates require clinical-role and identity review.",profiles};
await writeFile(new URL("../generated/cohort-discovery.mjs",import.meta.url),`export const cohortDiscovery=${JSON.stringify(payload,null,2)};\n`);
console.log(JSON.stringify({profiles:profiles.length,worksSearched:searches.length*100}));
