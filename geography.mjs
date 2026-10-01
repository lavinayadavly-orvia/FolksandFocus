import {individualLocationReviews} from './location-reviews.mjs';
// Match explicit cities or reviewed institutional branches, never a chain alone.
const places = {
  Karnataka:['Bengaluru|Bangalore','Mysuru|Mysore','Mangaluru|Mangalore'],
  Goa:['Panaji|Panjim'],
  Telangana:['Hyderabad','Secunderabad','Karimnagar','Nizamabad','Warangal'],
  'Andhra Pradesh':['Visakhapatnam|Vizag','Vijayawada','Guntur','Anantapur','Kakinada','Kurnool','Nellore','Rajahmundry','Srikakulam','Vizianagaram','Tirupati','Ongole'],
  Maharashtra:['Navi Mumbai|Navi-mumbai','Mumbai','Pune','Nagpur','Nashik','Thane','Sangamner','Kolhapur','Chhatrapati Sambhajinagar|Aurangabad|Chh. Sambhajinagar'],
  Kerala:['Kannur','Kollam','Palakkad','Kozhikode|Calicut','Kochi','Kasaragod','Kottakkal','Areekode','Thiruvananthapuram'],
  'West Bengal':['Kolkata','Siliguri'], 'Tamil Nadu':['Chennai','Salem','Coimbatore','Madurai','Tiruchirappalli|Trichy','Hosur','Tirunelveli'],
  Haryana:['Gurugram|Gurgaon','Faridabad'], 'Uttar Pradesh':['Ghaziabad','Noida','Lucknow','Saharanpur'],
  Delhi:['New Delhi|Delhi'], Odisha:['Bhubaneswar'], 'Madhya Pradesh':['Indore','Bhopal'],
  Rajasthan:['Jaipur'], Jharkhand:['Ranchi'], Punjab:['Patiala','Ludhiana','Bathinda','Mohali'], Uttarakhand:['Dehradun'], Bihar:['Patna'],
  Gujarat:['Ahmedabad','Bhuj'], Chhattisgarh:['Raipur']
};
const rules=Object.entries(places).flatMap(([state,cities])=>cities.map(aliases=>({state,city:aliases.split('|')[0],regex:new RegExp(`\\b(?:${aliases.replaceAll('.','\\.')})\\b`,'ig')})));
export const reviewedLocations=[
  ...individualLocationReviews,
  {profileUrl:'https://www.maxhealthcare.in/doctor/dr-amrendra-kumar-pandey',sourceUrl:'https://dramrendrapandey.com/',locations:['Ghaziabad'],reported:'Max Super Speciality Hospital, Vaishali, Ghaziabad, Uttar Pradesh; Shashwat Heart Wellness Clinic, Vasundhara, Ghaziabad',region:'Delhi NCR',checkedAt:'2026-10-01',locator:'Current practice introduction and Dedicated OPD In Ghaziabad addresses',identityBasis:'Full name, interventional cardiology specialty, Max affiliation and matching medical qualifications',secondarySourceUrl:'https://www.maxhealthcare.in/doctor/dr-amrendra-kumar-pandey'},
  {profileUrl:'https://www.maxhealthcare.in/doctor/dr-ajay-k-sharma',locations:['Noida'],reported:'Max Multi Speciality Centre, Sector-19, Noida',region:'Delhi NCR',checkedAt:'2026-10-01',locator:'Current appointment location, corroborated by About and practice FAQ; Patparganj is a previous posting'},
  {profileUrl:'https://www.maxhealthcare.in/doctor/dr-arif-mustaqueem',locations:['New Delhi'],reported:'Saket and BLK-Max, Delhi',checkedAt:'2026-10-01',locator:'Doctor is available at following locations'},
  {profileUrl:'https://www.maxhealthcare.in/doctor/dr-sandeep-budhiraja',locations:['New Delhi'],reported:'Max Super Speciality Hospital, Saket',checkedAt:'2026-10-01',locator:'Doctor is available at following locations'},
  {profileUrl:'https://www.maxhealthcare.in/doctor/dr-ambrish-mithal',locations:['New Delhi','Gurugram'],reported:'Saket and Gurgaon',checkedAt:'2026-10-01',locator:'Doctor is available at following locations'},
  {profileUrl:'https://www.maxhealthcare.in/doctor/dr-neeru-gera',locations:['New Delhi','Noida'],reported:'Saket, Shalimar Bagh, Noida and Panchsheel Park; FAQ lists Noida only',checkedAt:'2026-10-01',locator:'Location selector; inconsistent FAQ retained as multi-location, not assigned a primary city'}
];
export const dwarkaEvidence={url:'https://www.manipalhospitals.com/delhi/hospitals/',checkedAt:'2026-10-01',address:'Sector 6, Dwarka, New Delhi, Delhi 110075'};
function branchEvidence(p){
  const urls=(p.footprints||[]).filter(f=>f.type==='INSTITUTION').map(f=>f.url||'');
  if(urls.some(url=>/^https:\/\/www.manipalhospitals.com\/goa\/doctors\//.test(url)))return {locations:['Panaji'],sourceUrl:'https://www.manipalhospitals.com/goa/contact-us/',reported:'Dr E Borges Road, Dona Paula, Panaji, Goa',checkedAt:'2026-10-01',locator:'Exact Goa hospital doctor branch joined to official contact address'};
  const branch=urls.map(url=>url.match(/^https:\/\/www.kauveryhospital.com\/doctors\/([^/]+)\//)?.[1]).find(Boolean);
  const kauvery={chennai:'Chennai','chennai-vadapalani':'Chennai','maa-kauvery-radial-road':'Chennai','trichy-heartcity':'Tiruchirappalli','maa-kauvery-trichy':'Tiruchirappalli',hosur:'Hosur',tirunelveli:'Tirunelveli'};
  if(kauvery[branch])return {locations:[kauvery[branch]],sourceUrl:'https://www.kauveryhospital.com/contact-us/',reported:`Kauvery ${branch}`,checkedAt:'2026-10-01',locator:'Exact doctor branch URL joined to hospital contact directory',supportingSourceUrls:['https://www.kauveryhospital.com/our-locations/trichy-heartcity/','https://www.kauveryhospital.com/our-locations/tirunelveli/','https://www.kauveryhospital.com/']};
  const kims={Kompally:['Hyderabad','https://www.kimshospitals.com/kompally/'],Gachibowli:['Hyderabad','https://www.kimshospitals.com/gachibowli/contact-us/'],Begumpet:['Hyderabad','https://www.kimshospitals.com/locations/'],Kondapur:['Hyderabad','https://www.kimshospitals.com/Kondapur/'],'KIMS - Arete HITEC City':['Hyderabad','https://www.kimshospitals.com/kims-arete-hitec-city/'],Seethammadhara:['Visakhapatnam','https://www.kimshospitals.com/seethammadhara/contact-us/']};
  const kimsBranch=p.affiliation?.startsWith('KIMS Hospitals, ')?p.affiliation.slice('KIMS Hospitals, '.length):null;
  if(kims[kimsBranch])return {locations:[kims[kimsBranch][0]],sourceUrl:kims[kimsBranch][1],reported:p.affiliation,checkedAt:'2026-10-01',locator:'Exact institutional branch matched to official hospital address'};
  if(p.affiliation==='CARE Hospitals, Health City, Arilova')return {locations:['Visakhapatnam'],sourceUrl:'https://www.carehospitals.com/contact-us/care-hospitals-health-city-arilova',reported:p.affiliation,checkedAt:'2026-10-01',locator:'Official branch address'};
  if(p.affiliation==='Medicover Hospitals, Chandanagar')return {locations:['Hyderabad'],sourceUrl:'https://www.medicoverhospitals.in/doctors/dr-a-sharath-reddy',reported:p.affiliation,checkedAt:'2026-10-01',locator:'Official hospital directory labels branch Chandanagar, Hyderabad; joined to exact recorded doctor branch'};
  if(p.affiliation?.includes('Medicover')&&[p.affiliation,...(p.locationsAsReported||[])].some(s=>/financial[ -]district/i.test(s)))return {locations:['Hyderabad'],sourceUrl:'https://www.medicoverhospitals.in/doctors/dr-a-sharath-reddy',reported:'Medicover Financial District, Hyderabad',checkedAt:'2026-10-01',locator:'Current Work Location and Info; same named hospital branch'};
  if(urls.some(url=>/^https:\/\/www.kauveryhospital.com\/doctors\/chennai-radial-road\//.test(url)))return {locations:['Chennai'],sourceUrl:'https://www.kauveryhospital.com/doctors/chennai-radial-road/interventional-cardiology/prof-dr-ajith-pillai/',reported:'Kauvery Hospital, Chennai - Radial Road',checkedAt:'2026-10-01',locator:'Profile Location field and exact hospital branch URL'};
  if(p.affiliation?.includes('Manipal')&&(p.locationsAsReported||[]).some(l=>/^Dwarka - Delhi NCR$/i.test(l)))return {locations:['New Delhi'],sourceUrl:dwarkaEvidence.url,reported:dwarkaEvidence.address,checkedAt:dwarkaEvidence.checkedAt,locator:'Exact Dwarka branch address'};
  return null;
}
export function applyReviewedGeography(p){
  const evidence=reviewedLocations.find(r=>(p.footprints||[]).some(f=>f.url?.replace(/\/$/,'')===r.profileUrl))||branchEvidence(p);
  if(!evidence)return p;
  const location=locateDoctor(p);
  return {...p,...location,practiceLocations:[...evidence.locations],region:evidence.region||p.region,geographyEvidence:{...evidence,sourceUrl:evidence.sourceUrl||evidence.profileUrl,status:'HOSPITAL_LOCATION_REVIEWED'}};
}
export function locateDoctor(p){
  const known=x=>x && !/^(not verified|unknown)$/i.test(x);
  const review=reviewedLocations.find(r=>(p.footprints||[]).some(f=>f.url?.replace(/\/$/,'')===r.profileUrl));
  const reported=(p.locationsAsReported||[]).map(l=>p.affiliation?.includes('Manipal')&&/^Dwarka - Delhi NCR$/i.test(l)?'Dwarka - New Delhi':l);
  const evidence=review||branchEvidence(p);
  const text=(evidence?evidence.locations:[known(p.city)?p.city:'',...reported,p.affiliation||'']).join(' ; ');
  const hits=rules.flatMap(r=>[...text.matchAll(r.regex)].map(m=>({...r,start:m.index,end:m.index+m[0].length})));
  const matches=hits.filter(h=>!hits.some(other=>other!==h&&other.start<=h.start&&other.end>=h.end&&other.end-other.start>h.end-h.start));
  // NCR is a region spanning states, not evidence of a Delhi city address.
  const cities=[...new Map(matches.filter(h=>h.city!=='New Delhi'||!/^Delhi NCR/i.test(text.slice(h.start))).map(h=>[h.city,h])).values()];
  if(new Set(cities.map(c=>c.state)).size>1)return {state:'Multiple States',city:'Multiple Cities'};
  if(cities.length)return {state:cities[0].state,city:cities.length===1?cities[0].city:'Multiple Cities'};
  const state=Object.keys(places).concat('Goa').find(s=>(p.state===s)||(p.locationsAsReported||[]).some(l=>l.toLowerCase()===s.toLowerCase()));
  return {state:state||'Location Unresolved',city:'City Unresolved'};
}
export function geographyCuts(people){
  const unique=[...new Map(people.map(p=>[p.id,p])).values()];
  const rows=unique.map(person=>({person,...locateDoctor(person)}));
  const mapped=rows.filter(r=>!['Location Unresolved','Multiple States'].includes(r.state));
  const states=[...new Set(mapped.map(r=>r.state))].map(label=>{
    const members=mapped.filter(r=>r.state===label);
    return {label,count:members.length,rows:members,cities:[...new Set(members.map(r=>r.city))].map(city=>({label:city,rows:members.filter(r=>r.city===city),count:members.filter(r=>r.city===city).length})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label))};
  }).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
  const multiState=rows.filter(r=>r.state==='Multiple States').length;
  return {rows,states,mapped:mapped.length,total:unique.length,multiState,located:mapped.length+multiState,unresolved:rows.filter(r=>r.state==='Location Unresolved').length};
}
