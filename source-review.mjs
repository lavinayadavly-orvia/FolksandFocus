import {socialSourceKey} from './social-identity.mjs';
import {statementSourceKey} from './statement-quality.mjs';

function articleSummary(record){
  const issues=record.reviewIssues||[];
  const reviewed=record.roleReview?.role==='REVIEWER';
  const parts=[reviewed
    ?'Medical-review credit checked. Authorship and personal commentary are not established.'
    :record.status==='CONTENT_UNCONFIRMED'?'Article content not confirmed: multiple links returned the same untitled response.':record.status==='PAGE_CHECKED'?'Page checked; attribution awaits review.':'Article access not yet established.'];
  if(issues.includes('MANUAL_REVIEW_REQUIRES_RECHECK'))parts.push('Earlier attribution needs rechecking against the current source.');
  if(issues.includes('CONFLICTING_PUBLICATION_DATES'))parts.push('The publisher reports conflicting publication dates.');
  return parts.join(' ');
}

export function sourceReviewRecords(person){
  const social=(person.sourceDiscovery?.candidates||[]).map(r=>({...r,type:r.platform,
    title:r.title||`${r.platform} ${r.kind==='CONTENT'?'Content':'Account'} Candidate`,
    confidence:r.titleAttribution==='NAMED_IN_TITLE'?'TITLE_MATCHED':'REVIEW',
    discoverySources:r.sources,metadataStatus:r.videoMetadata?.status,summary:''}));
  const articles=(person.articleDiscovery?.candidates||[]).map(r=>({...r,type:'Hospital Article',confidence:'REVIEW',
    discoverySources:r.sources,summary:articleSummary(r)}));
  const manual=(person.footprints||person.records||[]).filter(r=>r.discoverySourceUrl&&r.confidence==='UNVERIFIED')
    .map(r=>({...r,platform:r.platform||r.publisher,publisher:null,discoverySources:[{url:r.discoverySourceUrl,checkedAt:r.checkedAt}]}));
  const records=new Map();
  for(const row of [...social,...articles,...manual]){
    const key=socialSourceKey(row.url,row.platform,true)||socialSourceKey(row.url,row.platform)||statementSourceKey(row.url);
    if(!key)continue;
    const prior=records.get(key);
    if(prior){
      const sources=[...prior.discoverySources||[],...row.discoverySources||[]];
      prior.discoverySources=[...new Map(sources.map(s=>[`${s.url}|${s.locator||''}`,s])).values()];
      continue;
    }
    records.set(key,{...row,reviewKey:key});
  }
  return [...records.values()];
}
