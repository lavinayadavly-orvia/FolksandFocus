import { writeFile } from 'node:fs/promises';
import { assessRegistryCandidate } from '../backend/registry-resolution.mjs';

// Public IMR search endpoint observed from the official search form. No credentials or challenge bypass.
const targets = [
  {name:'Shashank R Joshi',query:'Joshi Shashank',state:'MAH',match:/joshi/i},
  {name:'Anoop Misra',query:'Anoop',state:'',match:/misra/i},
  {name:'V Mohan',query:'Mohan',state:'TAM',match:/^(?:mohan[ .,-]*v\.?|v[ .,-]*mohan)\s*$/i},
  {name:'Duru Shah',query:'Duru',state:'MAH',match:/shah/i},
  {name:'Sanjay Kalra',query:'Kalra',state:'HAR',match:/sanjay/i},
  {name:'Banshi Saboo',query:'Banshi',state:'GUJ',match:/saboo/i},
  {name:'Awadhesh Kumar Singh',query:'Awadhesh',state:'WES',match:/singh/i},
  {name:'Om J Lakhani',query:'Lakhani',state:'GUJ',match:/\bom\b/i},
  {name:'Cyriac Abby Philips',query:'Cyriac',state:'TC',match:/philips/i}
];
const fields=['id','name','registration_no','registration_date','state_medical_council','state_code','year_of_info','qualification','qualification_year','university','additional_qualifications'];
const results=[];
const qualificationCandidates=new Map();
for(const target of targets){
  const result={target:target.name,status:'SEARCHED',records:[],queries:[]};
  for(let page=1;page<=8;page++){
    const url=new URL('https://nmc.org.in/indian-medical-register/search');
    url.search=new URLSearchParams({search_type:'advance',name:target.query,reg_no:'',year:'',state:target.state,page:String(page),per_page:'25'});
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
      if(!response.ok){result.status=`HTTP_${response.status}`;break;}
      const data=await response.json();
      if(data.success!==true||!Array.isArray(data.data))throw Error('Unexpected public response');
      result.queries.push({url:url.href,rows_returned:data.data.length,total_pages:data.pagination?.total_pages??null});
      // Discard addresses, birth dates, relatives and all other unrelated personal fields.
      result.records.push(...data.data.filter(r=>target.match.test(r.name)).map(r=>({...Object.fromEntries(fields.map(key=>[key,r[key]??null])),source_url:url.href,identity_status:'REVIEW',first_registration_confirmed:false,assessment:assessRegistryCandidate({name:target.name},{...r,source_url:url.href})})));
      for(const r of data.data){
        const qualifications=[r.qualification,...(r.additional_qualifications||[]).map(q=>q.qualification)].join(' ');
        if(/endocrin|diabet|cardiol|gen(?:eral)?\.?\s*med|gyna?e|obst|\bOBG\b/i.test(qualifications))qualificationCandidates.set(r.id,{...Object.fromEntries(fields.map(key=>[key,r[key]??null])),source_url:url.href,identity_status:'REVIEW',first_registration_confirmed:false});
      }
      const pages=Number(data.pagination?.total_pages);
      if(Number.isFinite(pages)&&page>=pages)break;
      if(!Number.isFinite(pages)&&data.data.length<25)break;
      result.status=page===8?'BOUNDED_PARTIAL':'SEARCHED';
    }catch(error){result.status='LOOKUP_FAILED';result.error=error.message;break;}
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  results.push(result);
  console.log(JSON.stringify({target:result.target,status:result.status,records:result.records}));
  await new Promise(resolve=>setTimeout(resolve,1500));
}
await writeFile(new URL('../generated/nmc-registry-review.json',import.meta.url),JSON.stringify({retrieved_at:new Date().toISOString(),source:'NMC public IMR',purpose:'Professional registration verification; not a verified clinician roster',results,qualification_candidates:[...qualificationCandidates.values()],sampling_note:'Qualification matches within bounded name searches only; not a representative specialty census.'},null,2)+'\n');
console.log(`Qualification-matched review candidates: ${qualificationCandidates.size}`);
