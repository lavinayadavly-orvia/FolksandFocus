import {researchProfiles, researchInfo, cohortLegacyLinks, socialAccounts, socialPosts} from './data.mjs';
import {LISTENING_STATEMENTS, SOURCE_LINKS, STATEMENT_QUALITY} from './listening-evidence.mjs';
import {doctorNames} from './listening-analytics.mjs';
import {guardSocialRecords,guardSocialInteractions} from './social-identity.mjs';
import {socialInteractions} from './social-interactions.mjs';
import {guardStatements,statementSourceKey} from './statement-quality.mjs';
import {sourceReviewRecords} from './source-review.mjs';
import {classifyExperience} from './reported-experience.mjs';

const normalize=s=>s.toLowerCase().replace(/\b(?:dr|prof|professor)\b/g,'').replace(/[^a-z]/g,'');
const phrase=value=>String(value||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\bhospitals\b/g,'hospital').trim().replace(/\s+/g,' ');
const containsPhrase=(text,value)=>Boolean(value)&&` ${text} `.includes(` ${value} `);
const specialtyPhrase=value=>phrase(value).replace(/\binternal medicine\b/g,'general medicine').replace(/\bgynecology\b/g,'gynaecology');
export function reconcileListening(people, statements, links, accounts=[], posts=[], legacyLinks=[], interactionRows=[]){
  const byName=new Map();
  for(const p of people)for(const name of new Set([p.name,...(p.aliases||[])].map(normalize))){
    const list=byName.get(name)||[];list.push(p);byName.set(name,list);
  }
  const resolutions=[],records=[],statementQuality=guardStatements(statements,links);
  for(const row of statementQuality.statements){
    const matched=[];
    for(const name of doctorNames(row)){
      const candidates=byName.get(normalize(name))||[];
      const corroborated=candidates.filter(p=>{
        const institutionWords=(p.affiliation||'').split(/;| · /).map(phrase).filter(Boolean);
        const institutionMatch=institutionWords.some(i=>containsPhrase(phrase(row.role),i));
        const reportedSpecialty=specialtyPhrase(row.specialty);
        const specialtyMatch=!/\b(veterinary|veterinarian)\b/.test(reportedSpecialty)&&(p.specialties||[]).some(s=>containsPhrase(reportedSpecialty,specialtyPhrase(s)));
        const review=links[row.source]?.identityReview;
        const reviewedIdentity=review?.status==='REVIEWED'&&review.cohortId===p.id&&review.checkedAt&&review.basis
          &&review.corroboratingSourceUrls?.length>=2
          &&p.footprints.some(e=>e.type==='INSTITUTION'&&e.url===review.profileSourceUrl);
        return specialtyMatch&&(institutionMatch||reviewedIdentity);
      });
      const person=corroborated.length===1?corroborated[0]:null;
      resolutions.push({statementId:row.id,name,cohortId:person?.id||null,status:person?'LINKED':'UNRESOLVED',
        basis:person?(links[row.source]?.identityReview?.cohortId===person.id?'Exact normalized name and specialty with documented cross-institution identity review':'Exact normalized name, source-reported institution and specialty'):'No unique corroborated cohort identity',
        sourceUrl:links[row.source]?.url||null,profileSourceUrls:person?.footprints.filter(e=>e.type==='INSTITUTION').map(e=>e.url)||[]});
      if(person)matched.push({id:person.id,name});
    }
    if(matched.length&&links[row.source]?.url)records.push({...row,sourceEvidence:links[row.source],cohortIds:[...new Set(matched.map(p=>p.id))],cohortDoctorNames:[...new Set(matched.map(p=>p.name))]});
  }
  const ids=new Set(people.map(p=>p.id)),legacyMap=new Map(legacyLinks.map(l=>[l.legacyId,l.cohortId]));
  const resolve=id=>ids.has(id)?id:legacyMap.get(id);
  const social=guardSocialRecords(accounts.map(a=>({...a,hcpId:resolve(a.hcpId),legacyHcpId:a.hcpId})),posts.map(p=>({...p,hcpId:resolve(p.hcpId)})),people);
  const mappedAccounts=social.accounts,mappedPosts=social.posts;
  const activity=guardSocialInteractions(interactionRows,mappedAccounts);
  const doctors=people.map(p=>{
    const classification=classifyExperience(p);
    const statements=records.filter(r=>r.cohortIds.includes(p.id));
    const activityUrls=[...new Set(statements.map(r=>statementSourceKey(links[r.source].url)).filter(Boolean))];
    const accounts=mappedAccounts.filter(a=>a.hcpId===p.id);
    const status=statements.length?'ACTIVITY_CAPTURED':accounts.length?'ACCOUNT_LINKED':'NOT_ESTABLISHED';
    return {id:p.id,name:p.name,specialties:p.specialties,affiliation:p.affiliation,locations:p.locationsAsReported,
      experience:p.experience||null,archetype:classification?.label||'Awaiting classification',classificationStatus:classification?.status||'NOT_ESTABLISHED',
      publications:p.footprints.filter(r=>r.type==='PUBLICATION'&&r.id.startsWith('PMID-')).map(r=>({id:r.id,url:r.url,date:r.date})),publicationSearch:p.publicationSearch||null,
      discoveredSourceCount:sourceReviewRecords(p).length,sourcePageChecked:p.sourceDiscovery?.pageChecked||false,
      titleMatchedVideoCount:p.sourceDiscovery?.candidates.filter(c=>c.titleAttribution==='NAMED_IN_TITLE').length||0,
      articleSourceCount:p.articleDiscovery?.candidates.length||0,articleDiscoveryStatus:p.articleDiscovery?.status||'NOT_CHECKED',
      status,accounts:accounts.map(a=>({platform:a.platform,url:a.profileUrl,collectionStatus:a.collectionStatus})),
      socialInteractionCounts:Object.fromEntries(['LIKE','REPOST','COMMENT'].map(type=>[type,activity.interactions.filter(r=>r.hcpId===p.id&&r.activityType===type).length])),
      statementIds:statements.map(r=>r.id),activities:activityUrls.length,lastActivity:statements.map(r=>r.date).filter(Boolean).sort().at(-1)||null};
  });
  const counts=Object.fromEntries(['ACTIVITY_CAPTURED','ACCOUNT_LINKED','NOT_ESTABLISHED'].map(s=>[s,doctors.filter(d=>d.status===s).length]));
  return {cohortTotal:people.length,counts,doctors,statements:records,resolutions,accounts:mappedAccounts,posts:mappedPosts,socialQuality:{review:social.review,duplicates:social.duplicates},statementQuality:{review:statementQuality.review,duplicates:statementQuality.duplicates,possibleDuplicates:statementQuality.possibleDuplicates},
    interactions:activity.interactions,interactionReview:activity.review,
    unresolvedVoices:new Set(resolutions.filter(r=>!r.cohortId).map(r=>r.name)).size,
    method:'Exact normalized name plus institution and specialty corroboration. No name-only joins. Missing activity means not established, not inactive.'};
}
export const listeningCohort={...reconcileListening(researchProfiles,LISTENING_STATEMENTS,SOURCE_LINKS,socialAccounts,socialPosts,cohortLegacyLinks,socialInteractions),statementQuality:{review:STATEMENT_QUALITY.review,duplicates:STATEMENT_QUALITY.duplicates,possibleDuplicates:STATEMENT_QUALITY.possibleDuplicates},cohortVersion:researchInfo.researchedAt,publicationCollection:researchInfo.publicationCollection,sourceDiscovery:researchInfo.sourceDiscovery,articleDiscovery:researchInfo.articleDiscovery};
