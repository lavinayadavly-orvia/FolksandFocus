import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {profileSourceDiscovery} from '../generated/profile-source-discovery.mjs';
import {sanitizeVideoMetadata} from '../video-metadata.mjs';

const [output]=process.argv.slice(2);
if(!output)throw Error('Usage: node scripts/collect-video-metadata.mjs OUTPUT_JSON');
const cache=output+'.checkpoints';fs.mkdirSync(cache,{recursive:true});
const videos=[...new Map(profileSourceDiscovery.doctors.flatMap(d=>d.candidates).filter(c=>c.platform==='YouTube'&&c.kind==='CONTENT').map(c=>[c.id,c])).values()];
let hostRestricted=false;
const records=[];
for(const [index,video] of videos.entries()){
  const file=path.join(cache,video.id.split(':').at(-1)+'.json');
  if(fs.existsSync(file)){
    const cached=JSON.parse(fs.readFileSync(file,'utf8'));records.push(cached);
    if(['HTTP_403','HTTP_429'].includes(cached.status)){hostRestricted=true;break;}
    continue;
  }
  if(hostRestricted)break;
  const sourceUrl='https://www.youtube.com/oembed?'+new URLSearchParams({url:video.url,format:'json'});
  const record={id:video.id,url:video.url,sourceUrl,checkedAt:new Date().toISOString()};
  await delay(1000);
  try{
    const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{'User-Agent':'DOLyticsResearch/1.0','Accept':'application/json'}});
    if(!response.ok){
      record.status=`HTTP_${response.status}`;
      if([403,429].includes(response.status))hostRestricted=true;
    }else{
      const body=await response.text();
      if(body.length>100000)throw Error('Response size limit');
      Object.assign(record,sanitizeVideoMetadata(JSON.parse(body)),{status:'METADATA_CHECKED',sha256:crypto.createHash('sha256').update(body).digest('hex')});
    }
  }catch(error){record.status='METADATA_UNAVAILABLE';record.errorType=error.name;}
  fs.writeFileSync(file,JSON.stringify(record));records.push(record);
  if((index+1)%50===0)console.log(JSON.stringify({processed:index+1,total:videos.length,checked:records.filter(r=>r.status==='METADATA_CHECKED').length}));
}
const result={generatedAt:new Date().toISOString(),cohortHash:profileSourceDiscovery.cohortHash,expectedVideos:videos.length,
  status:records.length===videos.length?'COMPLETE':'ACCESS_RESTRICTED',records,
  limitations:['Metadata establishes the publisher and title, not doctor ownership or spoken claims.','No video, transcript, thumbnail, engagement metrics or publication date downloaded or inferred.','Unavailable metadata does not establish deletion or inactivity.']};
fs.writeFileSync(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,processed:records.length,checked:records.filter(r=>r.status==='METADATA_CHECKED').length,total:videos.length}));
