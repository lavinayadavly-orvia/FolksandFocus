import {statementSourceKey} from './statement-quality.mjs';
const NON_INDIVIDUAL = new Set([
  'Asian Indian nutrition consensus', 'Endocrinologist (unnamed)',
  'Max Healthcare endocrinology team', "Dr. Mohan's Diabetes Specialities Centre",
  'National cardiology expert panel', 'RSSDI 2025 obesity track', 'ESI obesity guideline panel', 'Amita Gadre'
]);
export function publicationInWindow(record,window,all=false){
  if(all)return true;
  if(!record.date)return window.includeUndated===true;
  if(/^\d{4}-\d{2}-\d{2}$/.test(record.date||''))return record.date>=window.start&&record.date<=window.end;
  if(/^\d{4}-\d{2}$/.test(record.date||'')){
    const start=record.date+'-01',end=new Date(Date.UTC(Number(record.date.slice(0,4)),Number(record.date.slice(5)),0)).toISOString().slice(0,10);
    return start>=window.start&&end<=window.end;
  }
  return false;
}
export function doctorNames(row) {
  if(Array.isArray(row.cohortDoctorNames))return row.cohortDoctorNames;
  if (NON_INDIVIDUAL.has(row.who)) return [];
  if (row.who === 'Dr Amit Bhargava & Dr Varsha Narayanan') return ['Dr Amit Bhargava', 'Dr Varsha Narayanan'];
  return /^(Dr\b|Lt Gen \(Dr\))/.test(row.who) ? [row.who] : [];
}
export function listeningWindow(now = new Date(), months = 12) {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1)).toISOString().slice(0, 10);
  return { start, end, months: Array.from({ length: months }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + i + 1, 1)).toISOString().slice(0, 7)) };
}
export function activitySummary(rows, links, window) {
  const included = rows.filter(r => publicationInWindow(r,window) && statementSourceKey(links[r.source]?.url));
  const events = new Map();
  for (const row of included) {
    const url = statementSourceKey(links[row.source].url);
    // One attributed voice on one source page, not each coded quotation.
    const key = `${url}|${row.who}`;
    if (!events.has(key)) events.set(key, { id: key, date: row.date, who: row.who, doctors: doctorNames(row), channel: row.channel, url, statementIds: [] });
    events.get(key).statementIds.push(row.id);
  }
  const activities = [...events.values()];
  const doctors = new Set(activities.flatMap(a => a.doctors));
  return { activities, statements: included.length, doctors: doctors.size,
    otherVoices: new Set(activities.filter(a => !a.doctors.length).map(a => a.who)).size,
    sources: new Set(activities.map(a => a.url)).size,
    months: window.months.map(month => { const set = activities.filter(a => a.date?.startsWith(month)); return { month, activities: set.length, doctors: new Set(set.flatMap(a => a.doctors)).size, channels: Object.fromEntries([...new Set(set.map(a => a.channel))].map(c => [c, set.filter(a => a.channel === c).length])) }; }) };
}

export function collectionCoverage(cohort){
  if(!cohort||!Array.isArray(cohort.doctors)||cohort.doctors.length!==cohort.cohortTotal||new Set(cohort.doctors.map(d=>d.id)).size!==cohort.cohortTotal)return null;
  const people=cohort.doctors,total=cohort.cohortTotal;
  const checks=[
    {id:'publications',label:'Publication Searches',checked:people.filter(d=>d.publicationSearch?.status==='COMPLETE').length,checkedAt:cohort.publicationCollection?.checkedAt||null},
    {id:'socialLinks',label:'Hospital Social-Link Checks',checked:people.filter(d=>d.sourcePageChecked===true).length,checkedAt:cohort.sourceDiscovery?.checkedAt||null},
    {id:'articles',label:'Hospital Article Checks',checked:people.filter(d=>d.articleDiscoveryStatus==='PROFILE_CHECKED').length,checkedAt:cohort.articleDiscovery?.checkedAt||null}
  ].map(row=>({...row,total,notEstablished:total-row.checked}));
  return {total,checks,linkedAccountDoctors:people.filter(d=>d.accounts?.length).length,nativePosts:(cohort.posts||[]).length,
    doctorsWithReviewLinks:people.filter(d=>d.discoveredSourceCount>0).length,
    reviewLinks:people.reduce((n,d)=>n+(d.discoveredSourceCount||0),0)};
}

export function conversationSignals(rows, links, window) {
  const topics = [...new Set(rows.flatMap(r => r.themes))];
  return topics.map(topic => {
    const statements = rows.filter(r => r.themes.includes(topic) && publicationInWindow(r,window) && statementSourceKey(links[r.source]?.url));
    const summary = activitySummary(statements, links, window);
    const positive = statements.filter(r => r.sentiment === 'Positive');
    const negative = statements.filter(r => r.sentiment === 'Negative');
    const opposingDoctors = new Set([...positive, ...negative].flatMap(doctorNames));
    return { topic, doctors: summary.doctors, activities: summary.activities.length,
      positive: positive.length, negative: negative.length, mixed: statements.length-positive.length-negative.length,
      contrastingSignals: positive.length > 0 && negative.length > 0 && opposingDoctors.size >= 2,
      latest: [...statements].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0] || null };
  }).filter(t=>t.activities).sort((a,b)=>b.doctors-a.doctors || b.activities-a.activities || a.topic.localeCompare(b.topic));
}
// Literal mention facets never propagate molecule sentiment to a brand.
export function statementFacets(row) {
  const text=row.text||'';
  const named=names=>names.filter(name=>new RegExp(`\\b${name}\\b`,'i').test(text));
  const brand=named(['Wegovy','Ozempic','Rybelsus','Mounjaro','Yurpeak','Awiqli']);
  const molecule=named(['Semaglutide','Tirzepatide','Liraglutide','Insulin icodec']);
  const origin=[];
  if(/\bgeneric(?:s)?\b/i.test(text))origin.push('Generic');
  if(/\b(?:innovator|originator)(?:s)?\b/i.test(text))origin.push('Innovator');
  return {brand:brand.length?brand:['Unspecified brand'],molecule:molecule.length?molecule:['Unspecified molecule'],origin:origin.length?origin:['Unspecified origin'],specialty:[row.specialty||'Unspecified specialty']};
}

export function filterLens(rows,dimension,value) {
  return value?rows.filter(row=>statementFacets(row)[dimension]?.includes(value)):rows;
}

export function compareLens(rows,dimension,links,window) {
  const values=[...new Set(rows.flatMap(row=>statementFacets(row)[dimension]||[]))];
  return values.map(value=>{
    const selected=filterLens(rows,dimension,value);
    const summary=activitySummary(selected,links,window);
    const topics=conversationSignals(selected,links,window);
    return {value,statements:summary.statements,doctors:summary.doctors,activities:summary.activities.length,topics};
  }).sort((a,b)=>a.value.startsWith('Unspecified')-b.value.startsWith('Unspecified')||b.doctors-a.doctors||b.activities-a.activities);
}
// Surface repeated language without prescribing a therapeutic-area taxonomy.
// These are lexical candidates for review, not semantic or causal conclusions.
export function discoverPhrases(rows, minSources=2) {
  const stop=new Set('a an the and or but of to in on for from with without by as at is are was were be been being it its this that these those they their them we our you your i he she his her not no can could should would will may might have has had do does did also very more most less much many some any all such than then there here when where which who what how now new one two per cent over under into out about up down so if only often increasingly important need needs use used using'.split(' '));
  const phrases=new Map();
  for(const row of rows){
    const chunks=(row.text||'').toLowerCase().split(/[^a-z0-9\s-]+/);
    const seen=new Set();
    for(const chunk of chunks){
      const tokens=chunk.match(/[a-z][a-z0-9-]*/g)||[];
      for(let i=0;i<tokens.length;i++)for(const size of [2,3]){
        const words=tokens.slice(i,i+size);
        if(words.length!==size||words.some(w=>stop.has(w)||w.length<3))continue;
        const phrase=words.join(' ');
        if(phrase.length>36||seen.has(phrase))continue;
        seen.add(phrase);
        if(!phrases.has(phrase))phrases.set(phrase,{phrase,ids:[],sources:new Set(),voices:new Set()});
        const item=phrases.get(phrase);item.ids.push(row.id);item.sources.add(row.source);item.voices.add(row.who);
      }
    }
  }
  return [...phrases.values()].filter(p=>p.sources.size>=minSources&&p.voices.size>=2)
    .sort((a,b)=>b.sources.size-a.sources.size||b.voices.size-a.voices.size||b.phrase.length-a.phrase.length||a.phrase.localeCompare(b.phrase))
    .filter((p,_,all)=>!all.some(other=>other!==p&&other.phrase.includes(p.phrase)&&other.ids.length===p.ids.length))
    .map(p=>({name:p.phrase,statementIds:p.ids,sources:p.sources.size,voices:p.voices.size}));
}

export function clinicalSubjects(row) {
  const text=row.text||'';
  const rules=[['Obesity',/\b(?:obesity|obese)\b/i],['T2DM',/\b(?:t2dm|t2d|type[ -]2 diabetes|type ii diabetes)\b/i],['Diabetes (type unspecified)',/\bdiabet(?:es|ic)\b/i],['CKD',/\b(?:ckd|chronic kidney disease)\b/i],['Heart failure',/\bheart failure\b/i],['PCOS',/\b(?:pcos|polycystic ovar(?:y|ian) syndrome)\b/i]];
  const found=rules.filter(([,pattern])=>pattern.test(text)).map(([name])=>name);
  return found.length?found.filter(name=>name!=='Diabetes (type unspecified)'||!found.includes('T2DM')):['Other / not explicitly identified'];
}
export function formatTopicLabel(value) {
  const abbreviations=new Set(['glp-1','glp-1ra','gip','t2dm','t2d','ckd','pcos','hba1c','sglt2','dpp-4','bmi','cvd','gi']);
  return String(value).split(/(\s+)/).map(word=>{
    if(abbreviations.has(word.toLowerCase()))return word.toLowerCase()==='hba1c'?'HbA1c':word.toUpperCase();
    return word.replace(/\b[a-z]/g,letter=>letter.toUpperCase());
  }).join('');
}

export function executiveBrief(rows, links, window, selectedTopic = '') {
  const included = rows.filter(r=>publicationInWindow(r,window) && statementSourceKey(links[r.source]?.url));
  const named = included.filter(r=>doctorNames(r).length);
  const summary = activitySummary(included, links, window);
  const namedSummary = activitySummary(named, links, window);
  const topics = conversationSignals(named, links, window);
  const active = topics.find(t=>t.topic===selectedTopic) || topics[0] || null;
  const topicRows = active ? named.filter(r=>r.themes.includes(active.topic)) : named;
  const voices = [...new Set(topicRows.flatMap(doctorNames))].map(name=>{
    const statements = topicRows.filter(r=>doctorNames(r).includes(name)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));
    return {name, latest:statements[0], activities:activitySummary(statements,links,window).activities.length};
  }).sort((a,b)=>b.activities-a.activities || a.name.localeCompare(b.name));
  // Verification describes the captured source, not the truth of a clinical claim.
  const pages = new Map();
  for(const r of included) {
    const link=links[r.source], url=statementSourceKey(link.url);
    const checks=pages.get(url)||new Set();checks.add(link.check);pages.set(url,checks);
  }
  const pageChecked=[...pages.values()].filter(checks=>checks.size===1&&checks.has('page')).length;
  const indexOnly=[...pages.values()].filter(checks=>checks.size===1&&checks.has('index')).length;
  return {summary, namedActivities:namedSummary.activities.length, topics, active, voices,
    latestDate:included.map(r=>r.date).filter(Boolean).sort().at(-1)||null,
    quality:{pageChecked,indexOnly,other:pages.size-pageChecked-indexOnly,total:pages.size},
    otherActivities:summary.activities.length-namedSummary.activities.length};
}
