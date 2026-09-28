const countBy=items=>Object.fromEntries([...items.reduce((map,item)=>map.set(item.type,(map.get(item.type)||0)+1),new Map())].sort((a,b)=>b[1]-a[1]));

export function buildHcpAuditCard(person,accounts=[],posts=[]){
  if(!person)return null;
  const verifiedSources=person.footprints.filter(item=>item.confidence==="VERIFIED");
  const reviewSources=person.footprints.filter(item=>item.confidence==="REVIEW");
  const linkedAccounts=accounts.filter(item=>item.hcpId===person.id);
  const linkedPosts=posts.filter(item=>item.hcpId===person.id);
  return {
    hcpId:person.id,
    identity:{name:person.name,aliases:person.aliases,specialty:person.specialty,affiliation:person.affiliation,city:person.city,state:person.state,matchConfidence:person.matchConfidence,status:person.matchConfidence>=95?"IDENTITY_MATCHED":"REVIEW"},
    evidence:{total:person.footprints.length,verified:verifiedSources.length,review:reviewSources.length,sourceMix:countBy(person.footprints),records:person.footprints},
    digital:{accounts:linkedAccounts,posts:linkedPosts.length,lastCheckedAt:linkedAccounts.map(item=>item.lastCheckedAt).sort().at(-1)||null},
    classification:{tier:person.tier,status:"ANALYST_ASSIGNED",basis:"Tier is an analyst classification; it is not a computed clinical-authority score."},
    qualityGates:[
      {name:"Identity resolved",passed:person.matchConfidence>=95},
      {name:"Institutional source present",passed:person.footprints.some(item=>item.type==="INSTITUTION"&&item.confidence==="VERIFIED")},
      {name:"Independent source present",passed:person.footprints.some(item=>item.type!=="INSTITUTION"&&item.confidence==="VERIFIED")},
      {name:"All records reviewed",passed:reviewSources.length===0}
    ]
  };
}
