import {personaGroups,buildPersonas,inPersonaGroup,countRecords,pageItems,profileLocationLabel,regionSummary,visibleProfileCohort} from './persona-model.mjs';
import {sourceLibrary} from './source-library.mjs';
import {renderVoiceDashboard} from './voice-dashboard-ui.mjs';
import {renderAnalytics} from './analytics-ui.mjs';
import {sourceReviewRecords} from './source-review.mjs';
import {statementAttributionLabel} from './listening-evidence.mjs';
const root=document.querySelector('#personaRoot');
const coverageDashboard=document.querySelector('#coverage');
coverageDashboard.classList.remove('view');
coverageDashboard.hidden=true;
root.after(coverageDashboard);
const voicesNavigation=document.createElement('nav');
voicesNavigation.className='persona-tabs';
voicesNavigation.setAttribute('aria-label','Clinical Voices sections');
voicesNavigation.innerHTML='<button data-voices-screen="profiles">Profiles</button><button data-voices-screen="conversations/all">Conversations</button><button data-voices-screen="directory">Doctor Directory</button>';
root.before(voicesNavigation);
voicesNavigation.querySelectorAll('button').forEach(button=>button.onclick=()=>navigate(button.dataset.voicesScreen));
const state={people:[],social:{accounts:[],posts:[]},evidence:[],cases:[],selected:null,group:null,query:'',directoryMode:'all',directoryPage:0,tab:'snapshot',recordPage:0,ready:false};
const conversationViews=new Map();
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(url,label)=>/^https?:\/\//.test(url||'')?`<a href="${e(url)}" target="_blank" rel="noopener">${e(label)} &#8599;</a>`:e(label);
const number=v=>v==null?'Not measured':Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1}).format(v);
const label=t=>({YouTube:'YouTube',LinkedIn:'LinkedIn',Instagram:'Instagram',X:'X'}[t]||t.toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()));
const bars=(items)=>{const max=Math.max(1,...items.map(x=>x[1]));return `<div class="persona-bars">${items.map(([name,n])=>`<div><span>${e(label(name))}</span><meter min="0" max="${max}" value="${n}">${n}</meter><b>${n}</b></div>`).join('')||'<p>No source records yet.</p>'}</div>`};
const metrics=items=>`<div class="persona-metrics">${items.map(([name,n])=>`<div><strong>${e(n)}</strong><span>${e(name)}</span></div>`).join('')}</div>`;
const pager=(p,kind)=>`<div class="persona-pager"><span>${p.total} records · ${p.page+1} / ${p.pages}</span><button type="button" data-page="${kind}" data-delta="-1" ${p.page===0?'disabled':''} aria-label="Previous page" title="Previous page">&#8592;</button><button type="button" data-page="${kind}" data-delta="1" ${p.page===p.pages-1?'disabled':''} aria-label="Next page" title="Next page">&#8594;</button></div>`;

function overview(){
  state.selected=null;
  const verified=state.people.filter(x=>!x.candidate),records=verified.flatMap(x=>x.records);
  root.innerHTML=`<div class="persona-intro voices-entry"><div><span class="voices-eyebrow">Clinical Voices</span><h2 tabindex="-1">Perspectives that matter.</h2></div><button class="quiet-button" data-group="all">All Profiles · ${verified.length.toLocaleString('en-IN')} &#8594;</button></div>
  <div class="persona-tiles">${personaGroups.map((g,i)=>{const people=state.people.filter(p=>inPersonaGroup(p,g.id));return `<button class="persona-tile persona-color-${i}" data-group="${g.id}" style="--persona-color:${g.color}"><span class="persona-tile-band">${e(g.description.split(' · ')[0])}<span aria-hidden="true">&#8599;</span></span><h3>${e(g.name)}</h3><div class="persona-tile-total"><strong>${people.length}</strong><span>Doctors</span></div><span class="persona-tile-footer">Conversations &amp; Perspectives <span aria-hidden="true">&#8594;</span></span></button>`}).join('')}</div>`;
  root.querySelectorAll('.persona-tile[data-group]').forEach(b=>b.onclick=()=>navigate(`conversations/${encodeURIComponent(b.dataset.group)}`));
  root.querySelector('.voices-entry [data-group]').onclick=()=>openDirectory('all');
}
function navigate(screen=''){
  const hash=`#voices${screen?`/${screen}`:''}`;
  if(location.hash===hash)route();else location.hash=hash;
}
function publicationQueue(){
  const query=(state.publicationQuery||'').toLowerCase().trim();
  const records=(state.publications||[]).filter(r=>!query||`${r.title} ${r.authors_as_listed.join(' ')} ${(r.candidate_names||[]).join(' ')}`.toLowerCase().includes(query)),page=pageItems(records,state.recordPage,window.matchMedia('(max-width:700px)').matches?1:3);
  root.innerHTML=`<div class="persona-breadcrumb"><button id="publicationBack">&#8592; Clinical Voices</button></div><div class="persona-intro"><h2 tabindex="-1">Publication Review</h2><span>${records.length} matching publications</span></div><label class="persona-search"><span class="sr-only">Find Publication or Author</span><input id="publicationSearch" type="search" value="${e(state.publicationQuery||'')}" placeholder="Title or doctor name"></label><p class="persona-note">These author matches need review. Confirmed co-authors are linked separately on their profiles. Publications are not counted as social posts.</p><div class="persona-records">${page.items.map(r=>`<article><span>${e(r.publication_type)} · ${e(r.online_publication_date)}</span><h3>${link(r.source_url,r.title)}</h3><p>Authors under review: ${e(r.authors_as_listed.join(', '))}</p><p>${e(r.summary)}</p><p>${e(r.disclosure_summary)}</p><small>Profile Matching Pending</small></article>`).join('')}</div>${pager(page,'publications')}<p class="persona-note">${link('https://www.ncbi.nlm.nih.gov/About/disclaimer.html','NCBI Data Disclaimer and Copyright')}</p>`;
  root.querySelector('#publicationBack').onclick=()=>navigate('profiles');
  root.querySelector('#publicationSearch').oninput=event=>{const position=event.target.selectionStart;state.publicationQuery=event.target.value;state.recordPage=0;publicationQueue();const input=root.querySelector('#publicationSearch');input.focus();input.setSelectionRange(position,position)};
  root.querySelectorAll('[data-page="publications"]').forEach(b=>b.onclick=()=>{state.recordPage+=Number(b.dataset.delta);publicationQueue()});
}
function openDirectory(group='all'){
  state.group=personaGroups.some(g=>g.id===group)?group:null;
  state.directoryMode=group==='review'?'review':group==='all'?'all':'tiers';state.query='';state.directoryPage=0;navigate('directory');
}
function directory(){
  root.innerHTML=`<div class="persona-breadcrumb"><button id="directoryBack">&#8592; Clinical Voices</button><span>Profile directory</span></div>
  <div class="persona-intro"><div><h2 tabindex="-1">Doctor Directory</h2></div><span class="persona-stamp">${state.people.length.toLocaleString('en-IN')} Profiles</span></div>
  <div class="voices-directory-toolbar"><div class="persona-tabs" role="tablist" aria-label="Directory view"><button role="tab" id="directoryAll" aria-controls="voicesDirectoryRows" aria-selected="${state.directoryMode==='all'}" data-mode="all">All Doctors (${state.people.length.toLocaleString('en-IN')})</button><button role="tab" id="directoryTiers" aria-controls="voicesDirectoryRows" aria-selected="${state.directoryMode==='tiers'}" data-mode="tiers">Archetypes</button></div><label class="persona-search"><span class="sr-only">Search all profiles</span><input type="search" placeholder="Search name, institution or city" value="${e(state.query)}"></label></div>
  <div id="voicesDirectoryRows" role="tabpanel" aria-labelledby="${state.directoryMode==='tiers'?'directoryTiers':state.directoryMode==='all'?'directoryAll':'directoryReview'}"></div>`;
  root.querySelector('#directoryBack').onclick=()=>navigate();
  root.querySelector('input').oninput=event=>{state.query=event.target.value;state.directoryPage=0;directoryRows()};
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.directoryMode=b.dataset.mode;state.query='';state.directoryPage=0;directory();root.querySelector(`[data-mode="${state.directoryMode}"]`).focus()});
  directoryRows();
}
function doctorRows(people){
  const page=pageItems(people,state.directoryPage,8);
  return `<div class="voices-doctor-list">${page.items.map(p=>`<button class="voices-doctor" data-doctor="${e(p.id)}"><span class="voices-radio" aria-hidden="true"></span><span><strong>${e(p.name)}</strong><small>${e(p.affiliation)}</small>${p.persona?`<small>${e(p.persona)}</small>`:''}</span><span class="voices-doctor-status">${p.candidate?'Candidate':p.sourceConfirmed?'Source confirmed':'Identity linked'}</span><span aria-hidden="true">&#8594;</span></button>`).join('')||'<p class="voices-empty">No collected experience records in this category yet.</p>'}</div>${pager(page,'directory')}`;
}
function discoveryDirectory(){
  const found=(state.discovery||[]).filter(p=>`${p.name} ${p.affiliation}`.toLowerCase().includes(state.query.toLowerCase()));
  root.innerHTML=`<div class="persona-breadcrumb"><button id="discoveryBack">&#8592; Clinical Voices</button></div><div class="persona-intro"><h2 tabindex="-1">Discovery Candidates</h2><span>Outside the confirmed cohort</span></div><label class="persona-search"><input type="search" placeholder="Search candidates" value="${e(state.query)}"></label>${doctorRows(found)}`;
  root.querySelector('#discoveryBack').onclick=()=>navigate('profiles');
  root.querySelector('input').oninput=event=>{state.query=event.target.value;state.directoryPage=0;discoveryDirectory();root.querySelector('input').focus()};
  root.querySelectorAll('[data-page="directory"]').forEach(b=>b.onclick=()=>{state.directoryPage+=Number(b.dataset.delta);discoveryDirectory()});
  root.querySelectorAll('[data-doctor]').forEach(b=>b.onclick=()=>navigate(`profile/${encodeURIComponent(b.dataset.doctor)}`));
}
function directoryRows(){
  const target=root.querySelector('#voicesDirectoryRows'),query=state.query.trim().toLowerCase();
  if(query){
    const found=state.people.filter(p=>`${p.name} ${p.affiliation} ${profileLocationLabel(p)}`.toLowerCase().includes(query));
    target.innerHTML=`<div class="voices-list-heading"><strong>Search results</strong><span>${found.length} profiles</span></div>${found.length?doctorRows(found):'<p class="voices-empty">No matching profiles.</p>'}`;
  }else if(state.directoryMode==='all'){
    target.innerHTML=doctorRows(state.people);
  }else if(state.directoryMode==='review'){
    target.innerHTML=`<div class="voices-list-heading"><strong>Experience Not Yet Collected</strong><span>Hospital or professional career evidence needed</span></div>${doctorRows(state.people.filter(p=>inPersonaGroup(p,'review')))}`;
  }else{
    target.innerHTML=personaGroups.map((g,i)=>{const people=state.people.filter(p=>inPersonaGroup(p,g.id)),expanded=state.group===g.id;return `<section class="voices-category" style="--persona-color:${g.color}"><h3><button class="voices-category-toggle" data-category="${g.id}" aria-expanded="${expanded}" aria-controls="voicesCategory${i}"><span class="voices-expand" aria-hidden="true">${expanded?'−':'+'}</span><span><strong>${g.name}</strong><small>${e(g.description)}</small></span><b>${people.length}</b><span class="voices-row-label">profiles</span></button></h3><div id="voicesCategory${i}" ${expanded?'':'hidden'}>${expanded?doctorRows(people):''}</div></section>`}).join('');
    target.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.directoryPage=0;state.group=state.group===b.dataset.category?null:b.dataset.category;directoryRows();root.querySelector(`[data-category="${b.dataset.category}"]`).focus()});
  }
  target.querySelectorAll('[data-doctor]').forEach(b=>b.onclick=()=>navigate(`profile/${encodeURIComponent(b.dataset.doctor)}`));
  target.querySelectorAll('[data-page="directory"]').forEach(b=>b.onclick=()=>{state.directoryPage+=Number(b.dataset.delta);directoryRows()});
}
function insights(){
  const people=state.people.filter(p=>!p.candidate),records=people.flatMap(p=>p.records);
  root.innerHTML=`<div class="persona-breadcrumb"><button id="insightsBack">&#8592; Clinical Voices</button><span>Source coverage</span></div><div class="persona-intro"><h2 tabindex="-1">Footprint & geography</h2><span class="persona-stamp">Identity-linked dossiers only</span></div><div class="persona-insights"><section><h3>Evidence composition</h3>${bars(countRecords(records))}</section><section><h3>Geographic distribution</h3>${bars(Object.entries(people.reduce((a,p)=>{a[p.region]=(a[p.region]||0)+1;return a},{})))}</section></div>`;
  root.querySelector('#insightsBack').onclick=()=>navigate();
}
function route(){
  if(!state.ready)return;
  const path=location.hash.slice(1).split('/');
  const evidenceDetail=offset=>{try{return path[offset]==='evidence'?{kind:decodeURIComponent(path[offset+1]||''),value:decodeURIComponent(path[offset+2]||''),page:0}:null}catch{return null}};
  const evidenceRoute=(base,selection)=>{location.hash=selection?`${base}/evidence/${encodeURIComponent(selection.kind)}/${encodeURIComponent(selection.value)}`:base};
  if(path[0]==='analytics'){
    root.replaceChildren();
    window.showView?.('analytics');
    const analyticsView=['voices','channels','geography'].includes(path[1])?path[1]:'overview';
    renderAnalytics(document.querySelector('#analytics'),state.people,state.listening||[],{
      ...conversationViews.get('analytics'),view:analyticsView,detail:evidenceDetail(1),
      geographySelection:analyticsView==='geography'&&path[2]?{state:decodeURIComponent(path[2]),city:path[3]?decodeURIComponent(path[3]):null}:null,
      onNavigate:view=>{location.hash=view==='overview'?'#analytics':`#analytics/${view}`},
      onOpenEvidence:selection=>evidenceRoute('#analytics',selection),
      onStateChange:options=>conversationViews.set('analytics',options),
      onOpenDoctor:id=>{history.pushState({voiceReturn:'analytics'},'',`#voices/profile/${encodeURIComponent(id)}`);route();}
    });
    return;
  }
  if(path[0]!=='voices')return;
  document.querySelector('#analytics').replaceChildren();
  if(typeof window.showView==='function')window.showView('persona');
  const isDashboard=path[1]==='coverage';
  coverageDashboard.hidden=!isDashboard;
  root.hidden=isDashboard;
  voicesNavigation.querySelectorAll('button').forEach(button=>{
    const active=button.dataset.voicesScreen===(isDashboard?'coverage':path[1]==='conversations'?'conversations/all':path[1]==='directory'?'directory':'profiles');
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  if(isDashboard){window.scrollTo({top:0,behavior:'instant'});return;}
  if(path[1]==='conversations'){
    let group;try{group=decodeURIComponent(path[2]||'all')}catch{group='all'}
    if(!['all','review',...personaGroups.map(g=>g.id)].includes(group))group='all';
    renderVoiceDashboard(root,state.people,state.listening||[],{
      ...conversationViews.get(group),group,detail:evidenceDetail(3),navigate:screen=>screen==='directory'?openDirectory(group):navigate(screen),
      onOpenEvidence:selection=>evidenceRoute(`#voices/conversations/${encodeURIComponent(group)}`,selection),
      onStateChange:options=>conversationViews.set(group,options),
      onOpenDoctor:id=>{
        history.pushState({voiceReturn:`conversations/${encodeURIComponent(group)}`},'',`#voices/profile/${encodeURIComponent(id)}`);
        route();
      }
    });
  }
  else if(path[1]==='directory')directory();
  else if(path[1]==='insights')insights();
  else if(path[1]==='discovery'||path[1]==='publications')overview();
  else if(path[1]==='profile'){
    let id;try{id=decodeURIComponent(path[2]||'')}catch{id=''}
    state.selected=[...state.people,...(state.discovery||[])].find(p=>p.id===id);
    if(state.selected){
      state.tab=['snapshot','research','digital','evidence','safety'].includes(path[3])?path[3]:'conversations';state.recordPage=0;
      if(state.tab==='conversations'){
        const base=`#voices/profile/${encodeURIComponent(id)}/conversations`;
        renderVoiceDashboard(root,[state.selected],state.listening||[],{
          title:state.selected.name,detail:evidenceDetail(4),
          navigate:screen=>navigate(screen==='directory'?`profile/${encodeURIComponent(id)}/snapshot`:'directory'),
          onOpenEvidence:selection=>evidenceRoute(base,selection),
          onOpenDoctor:doctorId=>navigate(`profile/${encodeURIComponent(doctorId)}/snapshot`),
        });
        const directoryButton=root.querySelector('[data-vd-doctors]');if(directoryButton)directoryButton.textContent='Professional Profile \u2192';
      }else profile();
    }else directory();
  }else overview();
  window.scrollTo({top:0,behavior:'instant'});root.querySelector('h2')?.focus({preventScroll:true});
}
function profile(){
  const p=state.selected;
  root.innerHTML=`<div class="persona-breadcrumb"><button id="personaBack">&#8592; All profiles</button><button id="personaSwitch">Clinical Voices home &#8594;</button></div>
  <header class="persona-profile-head"><div class="persona-monogram" aria-hidden="true">${e(p.name.replace(/^(Dr\.?|Prof\.?)\s+/,'').split(' ').slice(0,2).map(s=>s[0]).join(''))}</div><div><span class="persona-stamp">${e(p.persona)}${p.candidate?' · Provisional':''}</span><h2 tabindex="-1">${e(p.name)}</h2><p>${e(p.specialty)} · ${e(profileLocationLabel(p))}</p><p>${e(p.affiliation)}</p></div><span class="persona-identity">${p.candidate?'Identity review pending':p.sourceConfirmed?'Hospital profile confirmed':'Identity matched'}</span></header>
  ${state.tab==='digital'?'':metrics([['Linked records',p.records.length],['Identity-linked records',p.records.filter(r=>r.confidence==='VERIFIED').length],['Listening activities · All dates',p.listeningActivities||0],['Captured posts',state.social.posts.filter(x=>x.hcpId===p.id).length]])}
  <div class="persona-tabs" role="tablist" aria-label="Profile details">${[['snapshot','Profile'],['research','Research'],['digital','Digital voice'],['evidence','Evidence'],['safety','Safety']].map(([id,name])=>`<button role="tab" id="personaTab-${id}" aria-controls="personaDetail" aria-selected="${state.tab===id}" tabindex="${state.tab===id?0:-1}" data-detail="${id}">${name}</button>`).join('')}</div><section id="personaDetail" role="tabpanel" aria-labelledby="personaTab-${state.tab}"></section>`;
  const returnScreen=history.state?.voiceReturn;
  const fromAnalytics=returnScreen==='analytics';
  const fromConversation=typeof returnScreen==='string'&&returnScreen.startsWith('conversations/');
  if(fromConversation)root.querySelector('#personaBack').textContent='\u2190 Back to Conversations';
  if(fromAnalytics)root.querySelector('#personaBack').textContent='\u2190 Back to Analytics';
  root.querySelector('#personaBack').onclick=()=>{if(fromAnalytics)location.hash='#analytics';else navigate(fromConversation?returnScreen:'directory')};
  root.querySelector('#personaSwitch').onclick=()=>navigate();
  root.querySelectorAll('[data-detail]').forEach((b,i,buttons)=>{b.onclick=()=>navigate(`profile/${encodeURIComponent(p.id)}/${b.dataset.detail}`);b.onkeydown=event=>{let target;if(event.key==='ArrowRight')target=(i+1)%buttons.length;if(event.key==='ArrowLeft')target=(i+buttons.length-1)%buttons.length;if(event.key==='Home')target=0;if(event.key==='End')target=buttons.length-1;if(target!=null){event.preventDefault();buttons[target].click()}}});
  detail();
}
function recordCards(records){const page=pageItems(records,state.recordPage,window.matchMedia('(max-width:700px)').matches?1:3);return `<div class="persona-records">${page.items.map(r=>`<article><div class="persona-record-meta"><span>${e(r.type==='LISTENING'?(statementAttributionLabel(r)||'Clinical Commentary'):label(r.type||r.platform||'Source'))}</span><span>${e(r.date||r.publishedAt||'Publication date unconfirmed')}</span><span>${r.type==='LISTENING'?(r.sourceCheck==='page'?'Page Checked':r.sourceCheck==='index'?'Search-Indexed':'Source Status Unknown'):r.confidence==='VERIFIED'?'Identity-linked source':r.confidence==='SOURCE_CONFIRMED'?'Source confirmed':r.confidence==='TITLE_MATCHED'?'Title Matched · Content Unreviewed':'Needs review'}</span></div><h3>${link(r.url,r.title)}</h3>${r.summary?`<p>${e(r.summary)}</p>`:''}${r.type==='LISTENING'?`<small class="persona-source-reference persona-statement-context">${r.paraphrased===true?'Paraphrased':r.paraphrased===false?'Attributed Text':'Text Form Unconfirmed'} · ${r.clinicalFindingsAppraised===false?'Clinical Claims Not Appraised':'Clinical Appraisal Not Established'}</small><small class="persona-source-reference persona-statement-disclosure">${e(r.sponsorship||'Sponsorship Not Established')}</small>`:''}${r.publisher?`<small class="persona-source-reference">Published by ${link(r.publisherUrl,r.publisher)}</small>`:''}${r.metadataStatus&&r.metadataStatus!=='METADATA_CHECKED'?'<small class="persona-source-reference">Video metadata unavailable at last check</small>':''}${r.relationship?`<small>Relationship: ${e(r.relationship)}</small>`:''}${r.discoverySources?.length?`<small class="persona-source-reference">Found on ${link(r.discoverySources[0].url,'Source Page')} · Checked ${e(r.discoverySources[0].checkedAt?.slice(0,10)||'Unknown')}</small>`:''}</article>`).join('')||'<p>No records in this section.</p>'}</div>${pager(page,'records')}`}
function detail(){
  const p=state.selected,target=root.querySelector('#personaDetail'),accounts=state.social.accounts.filter(a=>a.hcpId===p.id),posts=state.social.posts.filter(a=>a.hcpId===p.id),found=sourceLibrary.filter(a=>a.hcpId===p.id),review=p.records.filter(r=>!['VERIFIED','SOURCE_CONFIRMED'].includes(r.confidence));
  if(state.tab==='snapshot')target.innerHTML=`<div class="persona-insights"><section><h3>Evidence composition</h3>${bars(countRecords(p.records))}</section><section><h3>Career & classification</h3><dl class="persona-facts"><div><dt>Experience</dt><dd>${e(p.experience?.label||'Not verified')}</dd></div><div><dt>Identity match</dt><dd>${p.matchConfidence==null?'Not assessed':`${p.matchConfidence}%`}</dd></div><div><dt>Clinical role</dt><dd>${p.candidate?'Needs verification':'Source-linked dossier'}</dd></div><div><dt>Source review</dt><dd>${review.length} pending</dd></div><div><dt>Experience tier</dt><dd>${e(p.persona)}</dd></div></dl>${p.experience?`<p class="persona-note">${e(p.experience.basis)} ${link(p.experience.url,'Career source')}</p>`:''}<p class="persona-note">${p.candidate?'Not included in verified HCP or geographic totals. Similar names may refer to the same person until resolved.':'Identity matching is separate from clinical authority. Posting frequency does not determine seniority.'}</p></section></div>`;
  if(state.tab==='snapshot'){
    const signals=p.intelligence;
    target.querySelector('.persona-facts').insertAdjacentHTML('beforeend',`<div><dt>Medical registration</dt><dd>${signals?.experience_tier?'Verified':'Verification pending'}</dd></div><div><dt>90-day behaviour</dt><dd>${signals?.primary_behavioral_archetype?`${e(label(signals.primary_behavioral_archetype))} · ${signals.posts_in_window} analysed posts`:'Not assessed'}</dd></div>`);
  }
  if(state.tab==='research')target.innerHTML=recordCards(p.records.filter(r=>['PUBLICATION','CONFERENCE','PODCAST','BLOG','NEWSLETTER'].includes(r.type)));
  if(state.tab==='digital'){
    const discovered=sourceReviewRecords(p);
    const digitalRecords=[...new Map([...found,...p.records.filter(r=>['SOCIAL','VIDEO'].includes(r.type)),...discovered].map(r=>[r.url,r])).values()];
    target.innerHTML=`<div class="persona-digital-stats">${metrics([['Linked accounts',accounts.length],['Captured posts',posts.length],['Sources to Review',discovered.length],['Named in Video Titles',(p.sourceDiscovery?.candidates||[]).filter(r=>r.titleAttribution==='NAMED_IN_TITLE').length]])}</div><details class="persona-note"><summary>Source Coverage</summary><p>Source candidates are excluded from verified account, post and monthly activity totals. These are timestamped observations, not live monitoring. Zero captured posts does not establish inactivity.${p.sourceDiscovery?` ${p.sourceDiscovery.pageChecked?'Hospital profile checked for source links.':'Hospital profile access not established.'}`:''}</p></details>${accounts.length?`<div class="persona-accounts">${accounts.map(a=>`<div><strong>${e(a.platform)}</strong>${link(a.profileUrl,a.handle)}<small>${a.collectionStatus==='CONNECTOR_REQUIRED'?'Connector required':'Public observation'} · ${e(a.lastCheckedAt||'Not checked')}</small></div>`).join('')}</div>`:''}${recordCards([...posts.map(a=>({type:a.platform,title:a.title,url:a.url,summary:`Captured ${a.capturedAt}. ${Object.entries(a.metrics||{}).map(([k,v])=>`${k}: ${number(v)}`).join(' · ')}. ${a.provenance}`,confidence:'REVIEW'})),...digitalRecords])}`;
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
    const [research,candidates,social,evidence,cases,publications,listening]=await Promise.all(['/api/research','/api/candidates','/api/social-monitor','/api/evidence','/api/safety-cases','/api/publication-review','/api/listening-cohort'].map(get));
    state.publications=publications.items;
    const intelligence={items:[]};
    try{
      for(let offset=0;;offset+=1000){
        const page=await get(`/api/intelligence/summary?limit=1000&offset=${offset}`);
        intelligence.items.push(...page.items);
        if(page.items.length<1000)break;
      }
    }catch{intelligence.items=[];}
    state.people=visibleProfileCohort(buildPersonas(research.items,[],intelligence.items,listening.statements));state.discovery=[];Object.assign(state,{social,listening:listening.statements,evidence:evidence.items,cases:cases.items});state.ready=true;overview();route();
  }catch(error){root.innerHTML=`<p>${e(error.message)}</p><button id="personaRetry">Retry</button>`;root.querySelector('button').onclick=loadPersonas}
}
loadPersonas();
window.addEventListener('hashchange',route);
document.querySelectorAll('.nav-item,[data-jump]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.view==='persona'||button.dataset.jump==='persona')navigate();
  else if(button.dataset.view==='analytics'){if(location.hash==='#analytics')route();else location.hash='#analytics';}
  else if(location.hash.startsWith('#voices'))history.replaceState(null,'',location.pathname+location.search);
}));
