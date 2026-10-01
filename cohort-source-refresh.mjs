export const sourceRefresh = [
  {cohortId:'HCP-04bbb1db08c6774f58',name:'Abhinay Tibdewal',institution:'Manipal',records:[
    {id:'REFRESH-AT-LINKEDIN',type:'SOCIAL',title:'Manipal Salt Lake: institutional welcome announcement',url:'https://www.linkedin.com/posts/official-manipal-hospitals_manipalhospitalsaltlake-cardiology-heartcare-activity-7384493000875229185--1rJ',publisher:'Manipal Hospitals / LinkedIn',date:null,checkedAt:'2026-09-30',confidence:'SOURCE_CONFIRMED',accessStatus:'PUBLIC_INDEX_READ',relationship:'Hospital-authored mention; not a clinician-authored post',summary:'The publicly indexed hospital post names Abhinay Tibdewal as Consultant, Interventional Cardiology at Salt Lake. Name, specialty and facility match the institutional profile. Relative age is not converted into a publication date; personal account ownership, engagement and clinical statements are not established.'}
  ]},
  {cohortId:'HCP-f103511d7be987c90d',name:'Divya C. Ragate',institution:'Aster CMI Bangalore',records:[
    ...[
      ['LINKEDIN','LinkedIn','https://www.linkedin.com/in/divya-c-ragate-aba724326'],
      ['INSTAGRAM','Instagram','https://www.instagram.com/drdivyaragate'],
      ['YOUTUBE','YouTube','https://www.youtube.com/@drdivyaragate']
    ].map(([key,platform,url])=>({id:`REFRESH-DCR-${key}`,type:'SOCIAL',title:`${platform}: professional website-linked account candidate`,url,publisher:platform,date:null,checkedAt:'2026-09-30',confidence:'UNVERIFIED',accessStatus:'REFERRING_PAGE_READ_TARGET_UNAVAILABLE',relationship:'Professional website outbound link; native account activity not verified',discoverySourceUrl:'https://www.drdivyaragate.in/',summary:'Link observed in the professional website footer. Aster and Avantis profiles corroborate name, specialty and training. Account control, post content, dates and engagement remain unverified; excluded from native social metrics.'}))
  ]},
  {cohortId:'HCP-fbba82c7a2e57c7f60',name:'Praveen Chandra',institution:'Medanta',records:[
    {id:'REFRESH-PC-PCR',type:'CONFERENCE',title:'EuroPCR contribution listing',url:'https://www.pcronline.com/Physicians/Praveen-Chandra2',publisher:'PCR Online',date:null,checkedAt:'2026-09-30',confidence:'SOURCE_CONFIRMED',accessStatus:'SEARCH_INDEX_READ_DIRECT_FETCH_TIMEOUT',relationship:'Professional contribution index',summary:'The professional index names Praveen Chandra at Medanta and lists 2026 contributions on coronary calcium and TAVI. The displayed X handle remains an account candidate, not a verified account or captured post.'},
    {id:'REFRESH-PC-LINKEDIN',type:'SOCIAL',title:'MASTR KAIZEN training announcement',url:'https://www.linkedin.com/posts/terumo-india-skill-lab_interventionalcardiology-patientcare-medanta-activity-7445721660617371648-TFej',publisher:'Terumo India Skill Lab / LinkedIn',date:null,eventDate:'2026-04-04',checkedAt:'2026-09-30',confidence:'SOURCE_CONFIRMED',accessStatus:'PUBLIC_INDEX_READ',relationship:'Organisation-authored mention; not a clinician-authored post',summary:'The organiser names Praveen Chandra in a Medanta training programme for 4-5 April 2026. This verifies a public mention, not attendance, personal endorsement or a post publication date.'}
  ]},
  {cohortId:'HCP-2166915f3e67f4877b',name:'Jasjeet Singh Wasir',institution:'Medanta',records:[
    {id:'REFRESH-JW-MEDIA',type:'VIDEO',title:'Obesity and diabetes talk: institutional media listing',url:'https://www.medanta.org/media-listing/dr-jasjeet-singh-wasir',publisher:'Medanta',date:null,checkedAt:'2026-09-30',confidence:'SOURCE_CONFIRMED',accessStatus:'PUBLIC_INDEX_READ',relationship:'Hospital-published media listing',summary:'Medanta identifies this media listing as featuring Jasjeet Singh Wasir. Video date, transcript, channel ownership and engagement have not been established; it is not included in monthly activity counts.'}
  ]},
  {cohortId:'HCP-b7b0eb6fe0c73ffd86',name:'Rajesh Rajput',institution:'Medanta',records:[
    {id:'REFRESH-RR-NDTV',type:'NEWS',title:'NDTV author listing: weekly versus daily insulin',url:'https://www.ndtv.com/authors/dr-rajesh-rajput-24564',publisher:'NDTV',date:'2026-07-31',checkedAt:'2026-09-30',confidence:'SOURCE_CONFIRMED',accessStatus:'AUTHOR_PAGE_READ_ARTICLE_SEARCH_INDEXED',relationship:'Named author and institutional affiliation',summary:'NDTV names Rajput as Director of Endocrinology and Diabetes at Medanta and lists a July 31 article about weekly insulin. Direct article access timed out. Its body was subsequently read through the search index; the separately imported paraphrase remains explicitly index-only evidence, not page-checked content or a native post.'}
  ]}
];
export function enrichSourceProfiles(profiles){
  const byId=new Map(profiles.map(p=>[p.id,p]));
  for(const entry of sourceRefresh){
    const person=byId.get(entry.cohortId);
    if(!person||person.name!==entry.name||!person.affiliation.includes(entry.institution))throw new Error(`Source refresh identity mismatch: ${entry.cohortId}`);
  }
  return profiles.map(p=>({...p,footprints:[...p.footprints,...(sourceRefresh.find(e=>e.cohortId===p.id)?.records||[]).map(r=>({...r,sourceId:r.id,sourceUrl:r.url}))]}));
}
export const refreshedSources=sourceRefresh.flatMap(p=>p.records.map(r=>({source_id:r.id,url:r.url,publisher:r.publisher,checkedAt:r.checkedAt,accessStatus:r.accessStatus})));
