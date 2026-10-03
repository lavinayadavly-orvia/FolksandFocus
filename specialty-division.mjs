export const categories = ['Diabetology','Cardiology','Endocrinology','Gynaecology / Obstetrics','Consulting Physicians','General Practitioners'];
const aliases = new Map([
  ['diabetologist',categories[0]],['diabetology',categories[0]],
  ['cardiologist',categories[1]],['cardiology',categories[1]],
  ['endocrinologist',categories[2]],['endocrinology',categories[2]],
  ['gynecologist',categories[3]],['gynaecologist',categories[3]],['obstetrics and gynaecology',categories[3]],
  ['consulting physician',categories[4]],['general medicine',categories[4]],['internal medicine',categories[4]],
  ['general practitioner',categories[5]],['general practice',categories[5]],
]);

export function divideSpecialty(specialties, qualifications = []) {
  const labels = (Array.isArray(specialties) ? specialties : [specialties]).filter(Boolean);
  const all = labels.join(' ').toLowerCase();
  const degree = (Array.isArray(qualifications) ? qualifications : [qualifications]).join(' ').toLowerCase();
  const candidates = [...new Set(labels.map(s=>aliases.get(s.trim().toLowerCase())).filter(Boolean))];
  const result = {primaryCategory:null,secondaryCategories:[],originalSpecialties:labels,bucket:'LATER',status:'SPECIALTY_REVIEW',reason:'No unambiguous target-specialty label',nextAction:'Review existing specialty and qualification evidence'};
  if (/cardiac.*an[ae]*esth/.test(all)) return {...result,status:'DEFERRED_SPECIALTY',reason:'Cardiac Anaesthesiology explicitly deferred',nextAction:'Retain for later specialty authorization'};
  if (!candidates.length) return result;
  let primary;
  if (candidates.length===1) primary=candidates[0];
  else {
    // A documented specialist designation takes precedence over general medicine.
    const specialist=candidates.filter(c=>!categories.slice(4).includes(c));
    if(specialist.length===1) primary=specialist[0];
    else if(specialist.length>1){
      const qualified=specialist.filter(c=>{
        const subject=c===categories[0]?'diabetolog':c===categories[1]?'cardiolog':c===categories[2]?'endocrinolog':'(?:obstetric|gynaecolog|gynecolog)';
        return new RegExp(`\\b(?:dm|dnb|drnb|mch|ms)\\s*[-( ]*${subject}`).test(degree);
      });
      if(qualified.length===1) primary=qualified[0];
    } else if (/\b(?:md|dnb)\s*[-( ]*(?:general|internal)?\s*medicine/.test(degree)) primary=categories[4];
  }
  if(!primary) return {...result,secondaryCategories:candidates,reason:'Multiple specialty labels without a decisive existing qualification',nextAction:'Review primary clinical role; retain all secondary labels'};
  return {...result,primaryCategory:primary,secondaryCategories:candidates.filter(c=>c!==primary),bucket:'NOW',status:'CLASSIFIED_FROM_EXISTING_DATA',reason:candidates.length===1?'Explicit specialty label':'Specialist role or qualification resolves overlapping labels',nextAction:null};
}
