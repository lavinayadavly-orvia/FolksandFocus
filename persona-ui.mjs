import {personaGroups,buildPersonas,inPersonaGroup,countRecords,pageItems} from './persona-model.mjs';
import {sourceLibrary} from './source-library.mjs';
const root=document.querySelector('#personaRoot');
const coverageDashboard=document.querySelector('#coverage');
coverageDashboard.classList.remove('view');
coverageDashboard.hidden=true;
root.after(coverageDashboard);
const voicesNavigation=document.createElement('nav');
voicesNavigation.className='persona-tabs';
voicesNavigation.setAttribute('aria-label','Clinical Voices sections');
voicesNavigation.innerHTML='<button data-voices-screen="dashboard">Dashboard</button><button data-voices-screen="profiles">Profiles</button>';
root.before(voicesNavigation);
voicesNavigation.querySelectorAll('button').forEach(button=>button.onclick=()=>navigate(button.dataset.voicesScreen));
const state={people:[],social:{accounts:[],posts:[]},evidence:[],cases:[],selected:null,group:null,query:'',directoryMode:'tiers',tab:'snapshot',recordPage:0,ready:false};
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>/^https?:\/\//.test(url||'')?`<a href="${e(url)}" target="_blank" rel="noopener">${e(label)} &#8599;</a>`:e(label);
const number=v=>v==null?'Not measured':Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1}).format(v);
const label=t=>t.toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const bars=(items)=>{const max=Math.max(1,...items.map(x=>x[1]));return `<div class="persona-bars">${items.map(([name,n])=>`<div><span>${e(label(name))}</span><meter min="0" max="${max}" value="${n}">${n}</meter><b>${n}</b></div>`).join('')||'<p>No source records yet.</p>'}</div>`};
const metrics=items=>`<div class="persona-metrics">${items.map(([name,n])=>`<div><strong>${e(n)}</strong><span>${e(name)}</span></div>`).join('')}</div>`;
const pager=(p,kind)=>`<div class="persona-pager"><span>${p.total} records · ${p.page+1} / ${p.pages}</span><button type="button" data-page="${kind}" data-delta="-1" ${p.page===0?'disabled':''} aria-label="Previous page" title="Previous page">&#8592;</button><button type="button" data-page="${kind}" data-delta="1" ${p.page===p.pages-1?'disabled':''} aria-label="Next page" title="Next page">&#8594;</button></div>`;

function overview(){
  state.selected=null;
  const verified=state.people.filter(x=>!x.candidate),records=verified.flatMap(x=>x.records);
  root.innerHTML=`<div class="persona-intro"><div><h2 tabindex="-1">People behind the perspectives</h2><p>Clinical experience. Independent perspectives.</p></div><span class="persona-stamp">${verified.length} identity-linked dossiers</span></div>
  <div class="persona-tiles">${personaGroups.map(g=>{const people=state.people.filter(p=>inPersonaGroup(p,g.id)),n=people.filter(p=>!p.candidate).length;return `<button class="persona-tile" data-group="${g.id}" style="--persona-color:${g.color}"><span>${e(g.name)}</span><strong>${people.length}</strong><small>${e(g.description)}</small><span class="persona-tile-counts">${n} verified · ${people.length-n} candidates</span></button>`}).join('')}</div>
  <div class="persona-review-summary"><button class="primary-button" data-group="all">All profiles (${state.people.length}) &#8594;</button><button class="quiet-button" data-group="review">Awaiting classification (${state.people.filter(p=>inPersonaGroup(p,'review')).length})</button></div>
  <p class="persona-note">Tiers require verified medical registration. Unverified dates remain unclassified.</p>
  <section class="voices-summary-band">${metrics([['Source links',records.length],['Source types',new Set(records.map(x=>x.type)).size],['Captured posts',state.social.posts.length],['Regions',new Set(verified.map(p=>p.region)).size]])}<button class="quiet-button" id="voicesInsights">Footprint & geography &#8594;</button></section>`;
  root.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>openDirectory(b.dataset.group));
  root.querySelector('#voicesInsights').onclick=()=>navigate('insights');
}
function navigate(screen=''){
  const hash=`#voices${screen?`/${screen}`:''}`;
  if(location.hash===hash)route();else location.hash=hash;
}
function openDirectory(group='all'){
  state.group=personaGroups.some(g=>g.id===group)?group:null;
  state.directoryMode=group==='review'?'review':'tiers';state.query='';navigate('directory');
}
function directory(){
  root.innerHTML=`<div class="persona-breadcrumb"><button id="directoryBack">&#8592; Clinical Voices</button><span>Profile directory</span></div>
  <div class="persona-intro"><div><h2 tabindex="-1">All profiles</h2><p>${state.people.filter(p=>!p.candidate).length} identity-linked dossiers · ${state.people.filter(p=>p.candidate).length} discovery candidates</p></div><span class="persona-stamp">${state.people.length} profiles</span></div>
  <div class="voices-directory-toolbar"><div class="persona-tabs" role="tablist" aria-label="Directory view"><button role="tab" id="directoryTiers" aria-controls="voicesDirectoryRows" aria-selected="${state.directoryMode==='tiers'}" data-mode="tiers">Experience tiers</button><button role="tab" id="directoryReview" aria-controls="voicesDirectoryRows" aria-selected="${state.directoryMode==='review'}" data-mode="review">Awaiting classification (${state.people.filter(p=>inPersonaGroup(p,'review')).length})</button></div><label class="persona-search"><span class="sr-only">Search all profiles</span><input type="search" placeholder="Search name, institution or city" value="${e(state.query)}"></label></div>
  <div id="voicesDirectoryRows" role="tabpanel" aria-labelledby="${state.directoryMode==='tiers'?'directoryTiers':'directoryReview'}"></div>`;
  root.querySelector('#directoryBack').onclick=()=>navigate();
  root.querySelector('input').oninput=event=>{state.query=event.target.value;directoryRows()};
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.directoryMode=b.dataset.mode;state.query='';directory();root.querySelector(`[data-mode="${state.directoryMode}"]`).focus()});
  directoryRows();
}
function doctorRows(people){
  return `<div class="voices-doctor-list">${people.map(p=>`<button class="voices-doctor" data-doctor="${e(p.id)}"><span class="voices-radio" aria-hidden="true"></span><span><strong>${e(p.name)}</strong><small>${e(p.affiliation)}</small></span><span class="voices-doctor-status">${p.candidate?'Candidate':'Identity linked'}</span><span aria-hidden="true">&#8594;</span></button>`).join('')||'<p class="voices-empty">No profiles with verified registration in this category yet.</p>'}</div>`;
}
function directoryRows(){
  const target=root.querySelector('#voicesDirectoryRows'),query=state.query.trim().toLowerCase();
  if(query){
    const found=state.people.filter(p=>`${p.name} ${p.affiliation} ${p.city}`.toLowerCase().includes(query));
    target.innerHTML=`<div class="voices-list-heading"><strong>Search results</strong><span>${found.length} profiles</span></div>${found.length?doctorRows(found):'<p class="voices-empty">No matching profiles.</p>'}`;
  }else if(state.directoryMode==='review'){
    target.innerHTML=`<div class="voices-list-heading"><strong>Awaiting registration evidence</strong><span>Not assigned to an experience tier</span></div>${doctorRows(state.people.filter(p=>inPersonaGroup(p,'review')))}`;
  }else{
    target.innerHTML=personaGroups.map((g,i)=>{const people=state.people.filter(p=>inPersonaGroup(p,g.id)),expanded=state.group===g.id;return `<section class="voices-category" style="--persona-color:${g.color}"><h3><button class="voices-category-toggle" data-category="${g.id}" aria-expanded="${expanded}" aria-controls="voicesCategory${i}"><span class="voices-expand" aria-hidden="true">${expanded?'−':'+'}</span><span><strong>${g.name}</strong><small>${e(g.description)}</small></span><b>${people.length}</b><span class="voices-row-label">profiles</span></button></h3><div id="voicesCategory${i}" ${expanded?'':'hidden'}>${expanded?doctorRows(people):''}</div></section>`}).join('');
    target.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.group=state.group===b.dataset.category?null:b.dataset.category;directoryRows();root.querySelector(`[data-category="${b.dataset.category}"]`).focus()});
  }
  target.querySelectorAll('[data-doctor]').forEach(b=>b.onclick=()=>navigate(`profile/${encodeURIComponent(b.dataset.doctor)}`));
}
function insights(){
  const people=state.people.filter(p=>!p.candidate),records=people.flatMap(p=>p.records);
  root.innerHTML=`<div class="persona-breadcrumb"><button id="insightsBack">&#8592; Clinical Voices</button><span>Source coverage</span></div><div class="persona-intro"><h2 tabindex="-1">Footprint & geography</h2><span class="persona-stamp">Identity-linked dossiers only</span></div><div class="persona-insights"><section><h3>Evidence composition</h3>${bars(countRecords(records))}</section><section><h3>Geographic distribution</h3>${bars(Object.entries(people.reduce((a,p)=>{a[p.region]=(a[p.region]||0)+1;return a},{})))}</section></div>`;
  root.querySelector('#insightsBack').onclick=()=>navigate();
}
function route(){
  if(!state.ready)return;
  const path=location.hash.slice(1).split('/');
  if(path[0]!=='voices')return;
  if(typeof window.showView==='function')window.showView('persona');
  const isDashboard=!path[1]||path[1]==='dashboard';
  coverageDashboard.hidden=!isDashboard;
  root.hidden=isDashboard;
  voicesNavigation.querySelectorAll('button').forEach(button=>{
    const active=button.dataset.voicesScreen===(isDashboard?'dashboard':'profiles');
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  if(isDashboard){window.scrollTo({top:0,behavior:'instant'});return;}
  if(path[1]==='directory')directory();
  else if(path[1]==='insights')insights();
  else if(path[1]==='profile'){
    let id;try{id=decodeURIComponent(path.slice(2).join('/'))}catch{id=''}
    state.selected=state.people.find(p=>p.id===id);
    if(state.selected){state.tab='snapshot';state.recordPage=0;profile()}else directory();
  }else overview();
  window.scrollTo({top:0,behavior:'instant'});root.querySelector('h2')?.focus({preventScroll:true});
}
function profile(){
  const p=state.selected;
  root.innerHTML=`<div class="persona-breadcrumb"><button id="personaBack">&#8592; All profiles</button><button id="personaSwitch">Clinical Voices home &#8594;</button></div>
  <header class="persona-profile-head"><div class="persona-monogram" aria-hidden="true">${e(p.name.replace(/^(Dr\.?|Prof\.?)\s+/,'').split(' ').slice(0,2).map(s=>s[0]).join(''))}</div><div><span class="persona-stamp">${e(p.persona)}${p.candidate?' · Provisional':''}</span><h2 tabindex="-1">${e(p.name)}</h2><p>${e(p.specialty)} · ${e(p.city)}</p><p>${e(p.affiliation)}</p></div><span class="persona-identity">${p.candidate?'Identity review pending':'Identity matched'}</span></header>
  ${metrics([['Linked records',p.records.length],['Verified records',p.records.filter(r=>r.confidence==='VERIFIED').length],['Source types',new Set(p.records.map(r=>r.type)).size],['Captured posts',state.social.posts.filter(x=>x.hcpId===p.id).length]])}
  <div class="persona-tabs" role="tablist" aria-label="Profile details">${[['snapshot','Profile'],['research','Research'],['digital','Digital voice'],['evidence','Evidence'],['safety','Safety']].map(([id,name])=>`<button role="tab" id="personaTab-${id}" aria-controls="personaDetail" aria-selected="${state.tab===id}" tabindex="${state.tab===id?0:-1}" data-detail="${id}">${name}</button>`).join('')}</div><section id="personaDetail" role="tabpanel" aria-labelledby="personaTab-${state.tab}"></section>`;
  root.querySelector('#personaBack').onclick=()=>navigate('directory');
  root.querySelector('#personaSwitch').onclick=()=>navigate();
  root.querySelectorAll('[data-detail]').forEach((b,i,buttons)=>{b.onclick=()=>{state.tab=b.dataset.detail;state.recordPage=0;profile();root.querySelector(`[data-detail="${state.tab}"]`).focus()};b.onkeydown=event=>{let target;if(event.key==='ArrowRight')target=(i+1)%buttons.length;if(event.key==='ArrowLeft')target=(i+buttons.length-1)%buttons.length;if(event.key==='Home')target=0;if(event.key==='End')target=buttons.length-1;if(target!=null){event.preventDefault();buttons[target].click()}}});
  detail();
}
function recordCards(records){const page=pageItems(records,state.recordPage,3);return `<div class="persona-records">${page.items.map(r=>`<article><div class="persona-record-meta"><span>${e(label(r.type||r.platform||'Source'))}</span><span>${e(r.date||r.publishedAt||'Publication date unconfirmed')}</span><span>${r.confidence==='VERIFIED'?'Identity-linked source':'Needs review'}</span></div><h3>${link(r.url,r.title)}</h3><p>${e(r.summary||'')}</p>${r.relationship?`<small>Relationship: ${e(r.relationship)}</small>`:''}</article>`).join('')||'<p>No records in this section.</p>'}</div>${pager(page,'records')}`}
function detail(){
  const p=state.selected,target=root.querySelector('#personaDetail'),accounts=state.social.accounts.filter(a=>a.hcpId===p.id),posts=state.social.posts.filter(a=>a.hcpId===p.id),found=sourceLibrary.filter(a=>a.hcpId===p.id),review=p.records.filter(r=>r.confidence!=='VERIFIED');
  if(state.tab==='snapshot')target.innerHTML=`<div class="persona-insights"><section><h3>Evidence composition</h3>${bars(countRecords(p.records))}</section><section><h3>Career & classification</h3><dl class="persona-facts"><div><dt>Experience</dt><dd>${e(p.experience?.label||'Not verified')}</dd></div><div><dt>Identity match</dt><dd>${p.matchConfidence==null?'Not assessed':`${p.matchConfidence}%`}</dd></div><div><dt>Clinical role</dt><dd>${p.candidate?'Needs verification':'Source-linked dossier'}</dd></div><div><dt>Source review</dt><dd>${review.length} pending</dd></div><div><dt>Experience tier</dt><dd>${e(p.persona)}</dd></div></dl>${p.experience?`<p class="persona-note">${e(p.experience.basis)} ${link(p.experience.url,'Career source')}</p>`:''}<p class="persona-note">${p.candidate?'Not included in verified HCP or geographic totals. Similar names may refer to the same person until resolved.':'Identity matching is separate from clinical authority. Posting frequency does not determine seniority.'}</p></section></div>`;
  if(state.tab==='snapshot'){
    const signals=p.intelligence;
    target.querySelector('.persona-facts').insertAdjacentHTML('beforeend',`<div><dt>Medical registration</dt><dd>${signals?.experience_tier?'Verified':'Verification pending'}</dd></div><div><dt>90-day behaviour</dt><dd>${signals?.primary_behavioral_archetype?`${e(label(signals.primary_behavioral_archetype))} · ${signals.posts_in_window} analysed posts`:'Not assessed'}</dd></div>`);
  }
  if(state.tab==='research')target.innerHTML=recordCards(p.records.filter(r=>['PUBLICATION','CONFERENCE','PODCAST','BLOG','NEWSLETTER'].includes(r.type)));
  if(state.tab==='digital'){
    target.innerHTML=`<div class="persona-digital-stats">${metrics([['Linked accounts',accounts.length],['Captured posts',posts.length],['Discovered sources',found.length]])}</div><p class="persona-note">Timestamped observations, not live listening or current follower totals.</p><div class="persona-accounts">${accounts.map(a=>`<div><strong>${e(a.platform)}</strong>${link(a.profileUrl,a.handle)}<small>${a.collectionStatus==='CONNECTOR_REQUIRED'?'Connector required':'Public observation'} · ${e(a.lastCheckedAt||'Not checked')}</small></div>`).join('')||'<p>No identity-resolved social accounts.</p>'}</div>${recordCards([...posts.map(a=>({type:a.platform,title:a.title,url:a.url,summary:`Captured ${a.capturedAt}. ${Object.entries(a.metrics||{}).map(([k,v])=>`${k}: ${number(v)}`).join(' · ')}. ${a.provenance}`,confidence:'REVIEW'})),...found])}`;
  }
  if(state.tab==='evidence')target.innerHTML=`<div class="persona-review-summary"><strong>${review.length} sources awaiting review</strong><span>${state.evidence.filter(x=>x.hcpId===p.id).length} claim-level records</span></div>${recordCards(p.records)}`;
  if(state.tab==='safety'){
    const cases=state.cases.filter(c=>c.hcpId===p.id);
    target.innerHTML=`<div class="persona-safety"><h3>${cases.length?'Linked safety records':'No linked safety data'}</h3>${metrics([['Linked cases',cases.length],['Open cases',cases.filter(c=>!['SUBMITTED','DISMISSED'].includes(c.status)).length]])}<p>No linked record does not establish the absence of adverse events. Safety assessment requires an authorised intake source and qualified review.</p>${cases.length?recordCards(cases.map(c=>({title:c.id,type:c.status,summary:`${c.product} · ${c.event}`,confidence:'REVIEW'}))):'<span class="persona-stamp">Intake not connected</span>'}</div>`;
  }
  bindPages();
}
function bindPages(){root.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.recordPage+=Number(b.dataset.delta);detail();root.querySelector('#personaDetail').scrollIntoView({block:'start'})})}
async function loadPersonas(){
  try{
    const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error(`Unable to load ${path}`);return r.json()};
    const [research,candidates,social,evidence,cases]=await Promise.all(['/api/research','/api/candidates','/api/social-monitor','/api/evidence','/api/safety-cases'].map(get));
    const intelligence=await get('/api/intelligence/summary').catch(()=>({items:[]}));
    state.people=buildPersonas(research.items,candidates.profiles,intelligence.items);Object.assign(state,{social,evidence:evidence.items,cases:cases.items});state.ready=true;overview();route();
  }catch(error){root.innerHTML=`<p>${e(error.message)}</p><button id="personaRetry">Retry</button>`;root.querySelector('button').onclick=loadPersonas}
}
loadPersonas();
window.addEventListener('hashchange',route);
document.querySelectorAll('.nav-item,[data-jump]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.view==='persona'||button.dataset.jump==='persona')navigate();
  else if(location.hash.startsWith('#voices'))history.replaceState(null,'',location.pathname+location.search);
}));
