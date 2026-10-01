import {inPersonaGroup} from './persona-model.mjs';
import {publicationInWindow,listeningWindow} from './listening-analytics.mjs';
import {guardStatements,statementSourceKey} from './statement-quality.mjs';

const stop=new Set('a an and are as at be been being but by can could did do does for from had has have he her him his how i if in into is it its may more most not of on or our she should so than that the their them then there these they this those through to too under use used uses using was we were what when where which while who will with would you your says said describes argues highlights cautions reports article source doctor dr treatment patients people also rather based'.split(' '));
for(const word of 'after alongside across among alone attributes attributed argues highlights describes says said according regarding including discusses places ndtv'.split(' '))stop.add(word);
export const wordTokens=text=>(String(text||'').toLowerCase().match(/[a-z][a-z0-9]*(?:[-'][a-z0-9]+)*/g)||[]).filter(w=>w.length>2&&!stop.has(w));

// Match clinical concepts in the actual text, not generic frequent words or metadata.
// Longest matches win so "heart failure" is not split into unrelated words.
const clinicalTerms=[
  ['Type 2 Diabetes','type[ -]?2 diabetes|t2dm'],['Chronic Kidney Disease','chronic kidney disease|ckd'],
  ['Heart Failure','heart failure'],['Heart Disease','heart disease|cardiovascular disease'],
  ['GLP-1','glp[ -]?1(?: receptor agonists?)?'],['SGLT2','sglt[ -]?2(?: inhibitors?)?'],
  ['Weight Loss','weight loss'],['Weight Regain','weight regain'],['Muscle Loss','muscle loss'],
  ['Bariatric Surgery','bariatric surgery'],['Medical Supervision','medical supervision'],
  ['Clinical Trials','clinical trials?'],['Real-World Evidence','real[ -]world (?:evidence|data)'],
  ['Side Effects','side effects?'],['Adverse Events','adverse events?'],['Long-Term Safety','long[ -]term safety'],
  ['Quality of Life','quality of life'],['Blood Pressure','blood pressure'],['Blood Glucose','blood (?:glucose|sugar)'],
  ['Insulin Resistance','insulin resistance'],['Physical Activity','physical activity'],
  ['Lifestyle Changes','lifestyle changes?'],['Patient Selection','patient selection'],
  ['Dose Titration','dose titration'],['Treatment Adherence','(?:treatment )?adherence'],
  ['Semaglutide','semaglutide'],['Tirzepatide','tirzepatide'],['Liraglutide','liraglutide'],
  ['Metformin','metformin'],['Insulin','insulin'],['Wegovy','wegovy'],['Ozempic','ozempic'],['Mounjaro','mounjaro'],['Yurpeak','yurpeak'],
  ['Obesity','obesity'],['Diabetes','diabetes'],['PCOS','pcos|polycystic ovar(?:y|ian) syndrome'],
  ['Thyroid','thyroid'],['Hypertension','hypertension'],['Dyslipidaemia','dyslipid[ae]emia'],
  ['Safety','safety'],['Efficacy','efficacy'],['Affordability','affordability'],['Cost','costs?'],
  ['Access','access'],['Nutrition','nutrition'],['Exercise','exercise'],['Protein','protein'],
  ['Hypoglycaemia','hypoglyc[ae]emia'],['Pancreatitis','pancreatitis'],['Nausea','nausea'],
  ['Generics','generics?'],['Innovator Medicines','innovator (?:drugs|medicines|brands)'],
];
export function clinicalWordMatches(text){
  const matches=[];
  for(const [label,pattern] of clinicalTerms){
    for(const m of String(text||'').matchAll(new RegExp(`\\b(?:${pattern})\\b`,'gi'))){
      matches.push({word:label.toLowerCase(),label,start:m.index,end:m.index+m[0].length});
    }
  }
  matches.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start);
  const selected=[];
  for(const match of matches)if(!selected.some(m=>match.start<m.end&&match.end>m.start))selected.push(match);
  return selected;
}

export function voiceDashboard(people,statements,{group='all',period='12',evidence='all',now=new Date()}={}){
  if(!['all','page','index'].includes(evidence))throw Error('Unknown evidence filter');
  const members=people.filter(p=>!p.candidate&&inPersonaGroup(p,group)),ids=new Set(members.map(p=>p.id));
  const window=listeningWindow(now),byId=new Map(),quality=guardStatements(statements);
  for(const s of quality.statements){
    if(!s.id||!s.sourceEvidence?.url||!s.cohortIds?.some(id=>ids.has(id)))continue;
    if(s.date&&s.date>window.end)continue;
    if(period!=='all'&&!publicationInWindow(s,window))continue;
    if(evidence!=='all'&&s.sourceEvidence.check!==evidence)continue;
    byId.set(s.id,s);
  }
  const rows=[...byId.values()];
  const themes=new Map(),words=new Map(),active=new Set(),sources=new Set();
  const sentiments={Positive:0,'Mixed / neutral':0,Negative:0,'Not coded':0};
  for(const s of rows){
    s.cohortIds.filter(id=>ids.has(id)).forEach(id=>active.add(id));
    sources.add(statementSourceKey(s.sourceEvidence.url));
    sentiments[Object.hasOwn(sentiments,s.sentiment)?s.sentiment:'Not coded']++;
    for(const t of new Set(s.themes||[]))themes.set(t,(themes.get(t)||0)+1);
    for(const {word,label} of clinicalWordMatches(s.text)){
      const entry=words.get(word)||{word,label,instances:0,statementIds:new Set()};
      entry.instances++;entry.statementIds.add(s.id);words.set(word,entry);
    }
  }
  return {members,rows,window,period,evidence,doctors:active.size,sources:sources.size,conflicts:quality.conflicts,sentiments,
    themes:[...themes].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),
    words:[...words.values()].map(w=>({...w,statementIds:[...w.statementIds]})).sort((a,b)=>b.instances-a.instances||a.word.localeCompare(b.word))};
}

export function analyticsCuts(people,statements,options={}){
  const data=voiceDashboard(people,statements,options),members=new Map(data.members.map(p=>[p.id,p]));
  const buckets=field=>{
    const result=new Map();
    for(const row of data.rows)for(const label of new Set(field(row))){
      if(!result.has(label))result.set(label,{label,rows:[],doctors:new Set()});
      const bucket=result.get(label);bucket.rows.push(row);
      row.cohortIds.filter(id=>members.has(id)).forEach(id=>bucket.doctors.add(id));
    }
    return [...result.values()].map(b=>({...b,count:b.rows.length,doctors:b.doctors.size})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
  };
  return {...data,
    channels:buckets(r=>[r.channel||'Unspecified Channel']),
    specialties:buckets(r=>r.cohortIds.filter(id=>members.has(id)).map(id=>members.get(id).specialty||members.get(id).specialties?.[0]||'Unspecified Specialty')),
    archetypes:buckets(r=>r.cohortIds.filter(id=>members.has(id)).map(id=>members.get(id).persona||members.get(id).tier||'Unclassified')),
    months:buckets(r=>r.date?[r.date.slice(0,7)]:[]).sort((a,b)=>a.label.localeCompare(b.label)),
    undated:data.rows.filter(r=>!r.date).length,
  };
}
