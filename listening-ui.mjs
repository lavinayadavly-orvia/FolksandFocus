import {
  LISTENING_META, LISTENING_STATEMENTS, LISTENING_SUMMARY, THEMES as REPORT_THEMES, THEME_DETAIL, SENTIMENTS, FRAMINGS,
  SPECIALTY_PROFILES, WHO_LEDE, KEY_VOICES, CHANNEL_LEDE, VIDEO_INVENTORY, SOURCE_COVERAGE, SOURCE_STATUS,
  TIMELINE_LEDE, EVENTS, MARKET, TEAM_ACTIONS, METHOD, QUARTERS, sourceLink,
  netOf, splitOf, quarterOf, groupBy, filterStatements, themeShift
} from './listening-evidence.mjs';

import { activitySummary, listeningWindow, conversationSignals, doctorNames, filterLens, compareLens, discoverPhrases, clinicalSubjects, formatTopicLabel, executiveBrief, publicationInWindow, collectionCoverage } from './listening-analytics.mjs';
import { SOURCE_LINKS, sponsorshipDisclosure, statementAttributionLabel } from './listening-evidence.mjs';
import {statementSourceKey} from './statement-quality.mjs';
const root = document.querySelector('#listeningRoot');
let topicBasis='discovered';
let ALL=LISTENING_STATEMENTS;
let THEMES=[];
function analyseTopics() {
  const discovery=discoverPhrases(LISTENING_STATEMENTS).map(topic=>({...topic,name:formatTopicLabel(topic.name)}));
  THEMES=topicBasis==='discovered'?discovery:REPORT_THEMES;
  ALL=topicBasis==='discovered'?LISTENING_STATEMENTS.map(row=>({...row,themes:discovery.filter(topic=>topic.statementIds.includes(row.id)).map(topic=>topic.name)})):LISTENING_STATEMENTS;
}
analyseTopics();
const TABS = [['overview', 'Dashboard'], ['coverage', 'Cohort Coverage'], ['themes', 'Topics'], ['voices', 'Doctors'], ['channels', 'Sources']];
let cohortData=null,cohortError='',listeningScope='cohort',coverageQuery='',coverageStatus='',coverageSpecialty='',coveragePage=0;
let evidencePage = 0;
let evidenceOrigin = 'overview';
let dashboardScreen='brief';
let briefTopic='';
let briefPage=0;
let evidenceContext=null;
let evidenceDoctor='';
const briefMobile=window.matchMedia('(max-width:760px)');
const briefPageSize=()=>briefMobile.matches?3:5;
let followedTopics = [];
try { const saved=JSON.parse(localStorage.getItem('ff-listening-topics') || '[]'); if(Array.isArray(saved)) followedTopics=saved.filter(t=>THEMES.some(x=>x.name===t)); } catch {}
let subject = '';
let lens = 'brand';
let lensValue = '';
const LENSES={brand:'Brand',molecule:'Molecule',specialty:'Specialty'};
const observationWindow = listeningWindow();
let selectedMonth = '';
let windowMode = '12';
const state = { tab: 'overview', filters: { specialty: '', theme: '', channel: '', sentiment: '', period: '', query: '' }, heat: 'volume', team: 'Brand', eventType: '', sort: { key: 'date', dir: -1 }, openTheme: '' };

const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = n => (n > 0 ? `+${n}` : `${n}`);
const netClass = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'mix');
const sentClass = s => (s === 'Positive' ? 'pos' : s === 'Negative' ? 'neg' : 'mix');
const fmtDate = iso => iso ? new Date(`${iso.length===7?iso+'-01':iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...(iso.length===7?{}:{day:'2-digit'}), month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Date Unconfirmed';
const bold = s => e(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const initials = name => name.replace(/^(Dr\.?|Prof\.?|Lt Gen \(Dr\))\s+/, '').split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('');
const scopedRows=()=>listeningScope==='context'?ALL:(cohortData?.statements||[]).map(r=>({...r,themes:ALL.find(x=>x.id===r.id)?.themes||[]}));
const baseRows = () => filterStatements(scopedRows(), state.filters).filter(r => (windowMode === 'all' || (r.date >= observationWindow.start && r.date <= observationWindow.end)) && (!selectedMonth || r.date?.startsWith(selectedMonth)) && (!subject || clinicalSubjects(r).includes(subject)));
const rows = () => filterLens(baseRows(),lens,lensValue).filter(r=>!evidenceDoctor||doctorNames(r).includes(evidenceDoctor));
const activeFilterCount = () => Object.values(state.filters).filter(Boolean).length + Number(Boolean(lensValue)) + Number(Boolean(evidenceDoctor));

const netPill = n => `<span class="ls-pill ls-${netClass(n)}">net ${signed(n)}</span>`;
const sentPill = s => `<span class="ls-pill ls-${sentClass(s)}">${e(s)}</span>`;
const splitBar = (split, total) => `<span class="ls-split" aria-hidden="true">${split.map((n, i) => n ? `<i class="ls-${['neg', 'mix', 'pos'][i]}" style="flex:${n}"></i>` : '').join('')}${total ? '' : '<i class="ls-empty" style="flex:1"></i>'}</span>`;
const legend = () => `<div class="ls-legend">${SENTIMENTS.map((s, i) => `<span><i class="ls-${['neg', 'mix', 'pos'][i]}"></i>${e(s)}</span>`).join('')}</div>`;
const heading = (title, aside = '', eyebrow = '') => `<div class="analysis-heading"><div>${eyebrow ? `<p class="chart-eyebrow">${e(eyebrow)}</p>` : ''}<h2>${e(title)}</h2></div>${aside ? `<span>${aside}</span>` : ''}</div>`;
const disclosure = record => { const text=sponsorshipDisclosure(record);return text?`<span class="ls-source-disclosure">${e(text)}</span>`:''; };
const srcLink = label => { const l = sourceLink(label); if (!l) return `<span class="ls-source">${e(label)}</span>`; return `<a class="ls-source" href="${e(l.url)}" target="_blank" rel="noopener" title="${e([l.check === 'index' ? 'Search-index evidence' : 'Page checked', l.note].filter(Boolean).join(' · '))}">${e(label)} &#8599;</a>${disclosure(label)}`; };
const empty = msg => `<p class="ls-empty-state">${e(msg)}</p>`;

function statementItem(r) {
  return `<article class="ls-statement ls-edge-${sentClass(r.sentiment)}"><p>${e(r.text)}${r.paraphrased ? ' <em>(paraphrased)</em>' : ''}</p><div class="ls-statement-meta"><b>${e(r.who)}</b><span>${e(r.role)}</span>${statementAttributionLabel(r)?`<span>${e(statementAttributionLabel(r))}</span>`:''}<span>${fmtDate(r.date)}</span>${sentPill(r.sentiment)}${srcLink(r.source)}</div>${r.correction ? `<small class="ls-correction">Note: ${e(r.correction)}</small>` : ''}</article>`;
}

/* ---------- Shell ---------- */
function shell() {
  root.innerHTML = `
  <section class="ls-cohort-strip" id="lsCohortStrip" aria-label="Shared doctor cohort"></section>
  <div class="ls-focus"><div><strong>Clinical conversation intelligence</strong><small>Public-source collection · ${e(LISTENING_META.updated)} · not live monitoring</small></div><label>Explicit clinical subject<select id="lsSubject"><option value="">All captured discussions</option>${[...new Set(LISTENING_STATEMENTS.flatMap(clinicalSubjects))].sort().map(name=>`<option>${e(name)}</option>`).join('')}</select></label></div>
  <div class="coverage-metrics ls-metrics" id="lsMetrics" aria-live="polite"></div>
  <div class="persona-tabs ls-tabs" role="tablist" aria-label="Social listening views">${TABS.map(([id, name]) => `<button role="tab" id="lsTab-${id}" aria-controls="lsPanel" data-ls-tab="${id}">${name}</button>`).join('')}</div>
  <details class="ls-filter-drawer"><summary id="lsFilterSummary">Filters</summary><div class="ls-controls" id="lsControls">
    <label>Specialty<select data-filter="specialty"><option value="">All specialties</option>${[...groupBy(ALL, 'specialty').keys()].sort().map(x => `<option>${e(x)}</option>`).join('')}</select></label>
    <label>Theme<select data-filter="theme"><option value="">All themes</option>${THEMES.map(t => `<option>${e(t.name)}</option>`).join('')}</select></label>
    <label>Channel<select data-filter="channel"><option value="">All channels</option>${[...groupBy(ALL, 'channel').keys()].sort().map(x => `<option>${e(x)}</option>`).join('')}</select></label>
    <label>Sentiment<select data-filter="sentiment"><option value="">All sentiment</option>${SENTIMENTS.map(x => `<option>${e(x)}</option>`).join('')}</select></label>
    <label>Period<select id="lsWindow"><option value="12">Last 12 Months</option><option value="all">All Captured Dates</option></select></label>
    <label class="ls-query">Search statements<input type="search" data-filter="query" placeholder="Muscle, recall, AIIMS, Mounjaro"></label>
    <button class="quiet-button" id="lsReset" type="button">Reset filters</button>
  </div></details>
  <div class="scope-caption ls-caption" id="lsCaption"></div>
  <div class="ls-topic-basis"><label>Topic analysis<select id="lsTopicBasis"><option value="discovered">Discovered phrases</option><option value="report">Report-coded themes</option></select></label><span id="lsTopicMethod"></span></div>
  <div class="ls-lens-toolbar"><div role="group" aria-label="Analysis lens">${Object.entries(LENSES).map(([id,label])=>`<button data-lens="${id}" aria-pressed="${lens===id}">${label}</button>`).join('')}</div><label>Focus<select id="lsLensValue" aria-label="Analysis focus"></select></label></div>
  <div id="lsPanel" role="tabpanel" tabindex="-1"></div>`;
  const subjectControl=root.querySelector('.ls-focus label');
  subjectControl.firstChild.textContent='Subject';
  const controls=root.querySelector('#lsControls');
  controls.prepend(subjectControl);
  controls.prepend(root.querySelector('.ls-topic-basis label'));
  const notes=document.createElement('div');
  notes.className='ls-control-notes';
  notes.append(root.querySelector('.ls-focus small'),root.querySelector('#lsTopicMethod'));
  controls.after(notes);
  root.querySelector('.ls-focus').remove();
  root.querySelector('.ls-topic-basis').remove();
  const navigation=document.createElement('div');
  navigation.className='ls-navigation';
  root.querySelector('.ls-tabs').before(navigation);
  navigation.append(root.querySelector('.ls-tabs'),root.querySelector('.ls-filter-drawer'));
  root.querySelectorAll('[data-lens]').forEach(button=>button.onclick=()=>{lens=button.dataset.lens;lensValue='';render();});
  root.querySelector('#lsTopicBasis').onchange=event=>{topicBasis=event.target.value;state.filters.theme='';selectedNarrative='';analyseTopics();root.querySelector('[data-filter="theme"]').innerHTML=`<option value="">All topics</option>${THEMES.map(t=>`<option>${e(t.name)}</option>`).join('')}`;render();};
  root.querySelector('#lsLensValue').onchange=event=>{lensValue=event.target.value;render();};
  root.querySelectorAll('[data-ls-tab]').forEach((b, i, all) => {
    b.onclick = () => go(b.dataset.lsTab);
    b.onkeydown = ev => { const k = { ArrowRight: 1, ArrowLeft: -1 }[ev.key]; if (!k) return; ev.preventDefault(); const t = all[(i + k + all.length) % all.length]; go(t.dataset.lsTab); t.focus(); };
  });
  root.querySelectorAll('[data-filter]').forEach(el => { el[el.tagName === 'INPUT' ? 'oninput' : 'onchange'] = () => { state.filters[el.dataset.filter] = el.value; render(); }; });
  root.querySelector('#lsWindow').onchange = ev => { windowMode = ev.target.value; selectedMonth = ''; render(); };
  root.querySelector('#lsSubject').onchange = ev => { subject=ev.target.value; selectedMonth='';render(); };
  root.querySelector('#lsReset').onclick = () => { Object.keys(state.filters).forEach(k => (state.filters[k] = '')); selectedMonth = ''; subject='';lensValue='';evidenceDoctor='';briefTopic='';briefPage=0;coverageQuery='';coverageStatus='';coverageSpecialty='';coveragePage=0;root.querySelector('#lsSubject').value='';syncControls(); render(); };
}
function cohortDoctorsInWindow(){
  const records=(cohortData?.statements||[]).filter(r=>(windowMode==='all'||(r.date>=observationWindow.start&&r.date<=observationWindow.end))&&(!selectedMonth||r.date?.startsWith(selectedMonth)));
  return (cohortData?.doctors||[]).map(d=>{
    const found=records.filter(r=>r.cohortIds.includes(d.id));
    const publications=(d.publications||[]).filter(p=>publicationInWindow(p,observationWindow,windowMode==='all')&&(!selectedMonth||p.date?.startsWith(selectedMonth)));
    return {...d,publications,activities:new Set(found.map(r=>statementSourceKey(SOURCE_LINKS[r.source].url))).size,
      status:found.length?'ACTIVITY_CAPTURED':d.accounts.length?'ACCOUNT_LINKED':'NOT_ESTABLISHED'};
  });
}
function renderCohortHeader(){
  const target=root.querySelector('#lsCohortStrip');
  if(!cohortData){target.innerHTML=`<p>${cohortError?'Cohort data unavailable. No fallback counts are being shown.':'Loading shared doctor cohort…'}</p>${cohortError?'<button id="lsCohortRetry" class="quiet-button">Retry</button>':''}`;target.querySelector('button')?.addEventListener('click',loadListeningCohort);return;}
  const doctors=cohortDoctorsInWindow(),active=doctors.filter(d=>d.status==='ACTIVITY_CAPTURED').length;
  const accounts=doctors.filter(d=>d.accounts.length).length;
  target.innerHTML=`<div><span>Shared Doctor Cohort</span><strong>${cohortData.cohortTotal.toLocaleString('en-IN')}</strong></div><div><span>Doctors With Commentary</span><strong>${active}<small> / ${cohortData.cohortTotal.toLocaleString('en-IN')}</small></strong></div><div><span>Social Accounts Linked</span><strong>${accounts}<small> ${accounts===1?'doctor':'doctors'}</small></strong></div><div><span>Commentary Not Established</span><strong>${cohortData.cohortTotal-active}</strong></div><label>Conversation Scope<select id="lsCohortScope"><option value="cohort">Shared Cohort Only</option><option value="context">Broader Context · Not Cohort</option></select></label>`;
  const select=target.querySelector('select');select.value=listeningScope;
  select.closest('label').hidden=state.tab==='coverage';
  select.onchange=()=>{listeningScope=select.value;briefTopic='';briefPage=0;evidenceDoctor='';evidenceContext=null;state.filters.theme='';syncControls();render();};
}
function cohortCoverage(){
  const all=cohortDoctorsInWindow(),query=coverageQuery.toLowerCase().trim();
  const filtered=all.filter(d=>(!coverageStatus||(coverageStatus==='PUBLICATIONS_LINKED'?d.publications.length>0:coverageStatus==='SOURCES_DISCOVERED'?d.discoveredSourceCount>0:coverageStatus==='VIDEO_TITLE_MATCHED'?d.titleMatchedVideoCount>0:d.status===coverageStatus))&&(!coverageSpecialty||d.specialties.includes(coverageSpecialty))&&(!query||`${d.name} ${d.affiliation} ${d.specialties.join(' ')} ${d.locations.join(' ')}`.toLowerCase().includes(query)));
  const size=briefMobile.matches?3:8,pages=Math.max(1,Math.ceil(filtered.length/size));coveragePage=Math.min(coveragePage,pages-1);
  const labels={ACTIVITY_CAPTURED:'Commentary Captured',ACCOUNT_LINKED:'Account Linked · No Commentary',NOT_ESTABLISHED:'Commentary Not Established',PUBLICATIONS_LINKED:'Research Publications Found',SOURCES_DISCOVERED:'Source Links to Review · All Dates',VIDEO_TITLE_MATCHED:'Named in Video Titles · All Dates'};
  return `<section class="ls-panel ls-cohort-directory">${heading('Listening Coverage',`${all.length} cohort doctors · ${filtered.length} matching`)}<p class="chart-caption">${cohortData.publicationCollection?`PubMed checked for ${cohortData.publicationCollection.searched.toLocaleString('en-IN')} doctors. `:''}${all.filter(d=>d.publications.length).length} doctors have linked research in this period. Publications are separate from commentary; missing records do not mean inactivity.${cohortData.sourceDiscovery?` Hospital profiles checked for ${cohortData.sourceDiscovery.doctorsWithPageChecks.toLocaleString('en-IN')} doctors; source-review links cover all dates.`:''}</p><div class="ls-cohort-controls"><label>Find a Doctor<input id="lsCoverageQuery" type="search" placeholder="Name, hospital, specialty or location" value="${e(coverageQuery)}"></label><label>Specialty<select id="lsCoverageSpecialty"><option value="">All Specialties</option>${[...new Set(all.flatMap(d=>d.specialties))].sort().map(s=>`<option ${s===coverageSpecialty?'selected':''}>${e(s)}</option>`).join('')}</select></label><label>Coverage Status<select id="lsCoverageStatus"><option value="">All Cohort Doctors</option>${Object.entries(labels).map(([id,label])=>`<option value="${id}" ${coverageStatus===id?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="ls-cohort-rows">${filtered.slice(coveragePage*size,coveragePage*size+size).map(d=>`<article><div><a href="#voices/profile/${encodeURIComponent(d.id)}">${e(d.name)}</a><small>${e(d.specialties.join(' · '))} · ${e(d.affiliation)}</small><small>${d.publications.length?`<a href="#voices/profile/${encodeURIComponent(d.id)}">${d.publications.length} ${d.publications.length===1?'Publication':'Publications'} &#8594;</a>`:'No Linked Publications'}</small>${d.discoveredSourceCount?`<small><a href="#voices/profile/${encodeURIComponent(d.id)}/digital">${coverageStatus==='VIDEO_TITLE_MATCHED'?`${d.titleMatchedVideoCount} Title-Matched Videos`:`${d.discoveredSourceCount} Source Links to Review`} · All Dates &#8594;</a></small>`:''}</div><span>${labels[d.status]}</span><div>${d.accounts.map(a=>`<a href="${e(a.url)}" target="_blank" rel="noopener">${e(a.platform)} &#8599;</a>`).join(' ')||'<span>Account Not Linked</span>'}</div><button class="quiet-button" data-cohort-evidence="${e(d.id)}" ${d.activities?'':'disabled'}>${d.activities?`${d.activities} ${d.activities===1?'Activity':'Activities'} →`:'No Captured Commentary'}</button></article>`).join('')||empty('No cohort doctors match this selection.')}</div><div class="ls-evidence-pagination"><button data-coverage-page="${coveragePage-1}" ${coveragePage===0?'disabled':''} aria-label="Previous cohort doctors">&#8592;</button><span>${coveragePage+1} / ${pages}</span><button data-coverage-page="${coveragePage+1}" ${coveragePage===pages-1?'disabled':''} aria-label="Next cohort doctors">&#8594;</button></div></section>`;
}
async function loadListeningCohort(){
  cohortError='';renderCohortHeader();
  try{const response=await fetch('/api/listening-cohort');if(!response.ok)throw Error('Cohort request failed');const data=await response.json();
    if(!Array.isArray(data.doctors)||data.doctors.length!==data.cohortTotal||new Set(data.doctors.map(d=>d.id)).size!==data.cohortTotal)throw Error('Cohort count mismatch');
    cohortData=data;render();
  }catch(error){cohortError=error.message;renderCohortHeader();root.querySelector('#lsPanel').innerHTML=empty('Unable to load cohort-linked listening. Retry to restore the shared dataset.');}
}
function syncControls() { root.querySelectorAll('[data-filter]').forEach(el => { el.value = state.filters[el.dataset.filter]; }); }
function rememberEvidenceContext(){
  if(state.tab!=='ledger'&&!evidenceContext)evidenceContext={filters:{...state.filters},selectedMonth,lensValue,evidenceDoctor};
}
export function setFilter(key, value, tab) { if(tab==='ledger')rememberEvidenceContext();state.filters[key] = value; syncControls(); if (tab) go(tab); else render(); }

function conversationBrief(set){
  const brief=executiveBrief(set,SOURCE_LINKS,dashboardWindow(),briefTopic);
  const cohortChart=listeningScope==='cohort'&&!brief.topics.length;
  const chartItems=cohortChart?Object.entries(cohortData.doctors.reduce((a,d)=>{for(const s of d.specialties)a[s]=(a[s]||0)+1;return a},{})).map(([topic,doctors])=>({topic,doctors})).sort((a,b)=>b.doctors-a.doctors):brief.topics;
  const size=briefPageSize(),pages=Math.max(1,Math.ceil(chartItems.length/size));briefPage=Math.min(briefPage,pages-1);
  const visible=chartItems.slice(briefPage*size,briefPage*size+size);
  const max=Math.max(1,...chartItems.map(t=>t.doctors));
  const quality=brief.quality;
  return `<section class="ls-brief-screen"><header class="ls-brief-title"><div><p class="chart-eyebrow">SOCIAL LISTENING</p><h2>Conversation Brief</h2></div><span>${listeningScope==='cohort'?'Shared Cohort Only':'Broader Context, Not Cohort Coverage'} · Not Live</span></header>
  <div class="ls-brief-kpis">${[['Doctors in Conversation',brief.summary.doctors],['Attributed Activities',brief.namedActivities],['Source Pages',quality.total],['Latest Source',brief.latestDate?fmtDate(brief.latestDate):'No records']].map(([name,value])=>`<div><span>${name}</span><strong>${e(value)}</strong></div>`).join('')}</div>
  <div class="ls-brief-content"><section class="ls-brief-topics" aria-label="Topics by named doctor participation"><div class="ls-brief-section-title"><h3>${cohortChart?'Cohort Specialty Coverage':'What’s Being Discussed'}</h3><span>${cohortChart?'Cohort doctors':'Named doctors'}</span></div>
  <div class="ls-brief-bars">${visible.map(t=>`<button ${cohortChart?'data-cohort-specialty':'data-brief-topic'}="${e(t.topic)}" aria-pressed="${t.topic===brief.active?.topic}"><span>${e(t.topic)}</span><b>${t.doctors}</b><i><em style="width:${t.doctors/max*100}%"></em></i></button>`).join('')||empty('No recurring topic in this selection. Individual statements remain available.')} </div>
  <footer><span>${cohortChart?'Full cohort · Specialties overlap':topicBasis==='discovered'?'Recurring phrases · Topics can overlap':'Report-coded themes · Topics can overlap'}</span><div><button data-brief-page="${briefPage-1}" ${briefPage===0?'disabled':''} aria-label="Previous topics">&#8592;</button><span>${briefPage+1} / ${pages}</span><button data-brief-page="${briefPage+1}" ${briefPage===pages-1?'disabled':''} aria-label="Next topics">&#8594;</button></div></footer></section>
  <section class="ls-brief-voices" aria-label="Attributable perspectives"><div class="ls-brief-section-title"><h3>${e(brief.active?.topic||'Captured Perspectives')}</h3>${brief.active?`<button class="text-button" data-topic-evidence="${e(brief.active.topic)}">All Evidence &#8594;</button>`:''}</div>
  ${brief.voices.slice(0,briefMobile.matches?1:2).map(v=>`<article><div class="ls-brief-person"><button data-brief-doctor="${e(v.name)}" data-brief-doctor-topic="${e(brief.active?.topic||'')}">${e(v.name)} &#8599;</button><span>${v.activities} ${v.activities===1?'activity':'activities'}</span></div><p class="ls-brief-role">${e(v.latest.role)} · ${e(v.latest.specialty)}</p><p class="ls-brief-quote">${e(v.latest.text)}</p><small>${fmtDate(v.latest.date)} · ${v.latest.paraphrased?'Paraphrased':'Attributed statement'} · ${SOURCE_LINKS[v.latest.source]?.check==='page'?'Page checked':'Search-index evidence'}</small>${disclosure(v.latest)}</article>`).join('')||empty('No named doctor statements match these filters.')}
  <p class="ls-brief-authority">Roles are source-reported. Participation is not an authority ranking or clinical consensus.</p></section></div>
  <footer class="ls-brief-sourcebar"><div><strong>Evidence Coverage</strong><span>${quality.pageChecked} page-checked · ${quality.indexOnly} index-only${quality.other?` · ${quality.other} other`:''}</span></div><div class="ls-brief-quality" role="img" aria-label="${quality.pageChecked} page-checked source pages, ${quality.indexOnly} index-only, ${quality.other} other">${[['page',quality.pageChecked],['index',quality.indexOnly],['other',quality.other]].map(([kind,n])=>n?`<i class="ls-quality-${kind}" style="flex:${n}"></i>`:'').join('')}</div><button class="text-button" data-ls-go="channels">Inspect Sources &#8594;</button></footer>
  <p class="ls-brief-footnote">One doctor attribution per source page is one activity. ${brief.otherActivities} collective or other activities remain separate. Source checks do not validate clinical claims.</p></section>`;
}

function renderMetrics(set) {
  if (state.tab === 'overview') {
    const summary = activitySummary(set, SOURCE_LINKS, dashboardWindow());
    const current = summary.months.at(-1);
    root.querySelector('#lsMetrics').innerHTML = [
      ['Doctors observed', summary.doctors, 'Named individuals in the captured sources'],
      ['Public activities', summary.activities.length, `${summary.statements} coded statements · deduplicated by voice and source`],
      ['Doctors this month', current?.doctors || 0, 'Current month is partial'],
      ['Source pages', summary.sources, `${summary.otherVoices} collective, unnamed or other voices kept separate`]
    ].map(([label, value, note]) => `<div class="coverage-metric"><span>${e(label)}</span><strong>${value}</strong><small>${e(note)}</small></div>`).join('');
    root.querySelector('#lsCaption').textContent = `${dashboardWindow().start} to ${dashboardWindow().end} · Observed corpus, not exhaustive monitoring · No captured record does not prove no activity`;
    return;
  }
  const split = splitOf(set), themes = THEMES.map(t => [t.name, set.filter(r => r.themes.includes(t.name)).length]).sort((a, b) => b[1] - a[1]);
  const specs = [...groupBy(set, 'specialty')].sort((a, b) => b[1].length - a[1].length);
  const voices = new Set(set.map(r => r.who)).size, wave2 = set.filter(r => r.wave2).length;
  const items = [
    ['Statements in view', set.length, `${voices} voice${voices === 1 ? '' : 's'} · ${wave2} added in wave 2`],
    ['Net sentiment', set.length ? signed(netOf(set)) : '—', `${split[2]} positive · ${split[1]} mixed · ${split[0]} negative`],
    ['Most discussed theme', themes[0]?.[1] ? themes[0][0] : '—', themes[0]?.[1] ? `${themes[0][1]} statements` : 'No statements in view'],
    ['Most active specialty', specs[0]?.[0] || '—', specs[0] ? `${specs[0][1].length} statements` : 'No statements in view']
  ];
  root.querySelector('#lsMetrics').innerHTML = items.map(([l, v, s]) => `<div class="coverage-metric"><span>${e(l)}</span><strong class="${String(v).length > 8 ? 'ls-metric-text' : ''}">${e(v)}</strong><small>${e(s)}</small></div>`).join('');
  const f = activeFilterCount();
  root.querySelector('#lsCaption').innerHTML = `${set.length} of ${ALL.length} coded statements · ${selectedMonth ? `${selectedMonth} · ` : ''}${windowMode === '12' ? 'last 12 months · ' : ''}${f ? `${f} filters applied` : 'no additional filters'}${['report', 'timeline', 'actions', 'method', 'channels', 'voices', 'themes'].includes(state.tab) ? ' · narrative commentary reflects the full corpus' : ''}`;
}

function dashboardWindow() {
  if (windowMode === '12') return observationWindow;
  const earliest = ALL.map(r=>r.date).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&d<=observationWindow.end).sort()[0]||observationWindow.start;
  const start = new Date(`${earliest}T00:00:00Z`), end = new Date(`${observationWindow.end}T00:00:00Z`);
  return {...listeningWindow(end, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1),includeUndated:true};
}
function activityDashboard(set, panel='all') {
  const summary = activitySummary(set, SOURCE_LINKS, dashboardWindow());
  const channels = [...new Set(ALL.map(a => a.channel))].sort();
  const max = Math.max(1, ...summary.months.map(m => m.activities));
  const doctorMax = Math.max(1, ...summary.months.map(m => m.doctors));
  const monthly = (measure, scale) => summary.months.map(m => `<button class="ls-month" data-ls-month="${m.month}" title="${m.month}: ${m.activities} captured activities, ${m.doctors} named doctors"><b>${m[measure]}</b><span class="ls-month-track">${measure === 'activities' ? `<span class="ls-month-stack" style="height:${m.activities / scale * 100}%">${channels.map((c, i) => m.channels[c] ? `<i class="ls-channel-${i}" style="flex:${m.channels[c]}" title="${e(c)}: ${m.channels[c]}"></i>` : '').join('')}</span>` : `<span class="ls-month-doctors" style="height:${m.doctors / scale * 100}%"></span>`}</span><small>${new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'})}<br>${m.month.slice(0, 4)}</small></button>`).join('');
  const voices = [...new Set(summary.activities.flatMap(a => a.doctors))].map(name => [name, summary.activities.filter(a => a.doctors.includes(name)).length]).sort((a,b) => b[1]-a[1]).slice(0, 6);
  const activity=`<section class="ls-panel">${heading('Public activity over time', 'Select a month to open its source-linked statements')}<div class="ls-months">${monthly('activities', max)}</div><div class="ls-legend">${channels.map((c,i)=>`<span><i class="ls-channel-${i}"></i>${e(c)}</span>`).join('')}</div><p class="chart-caption">An activity is one attributed voice on one source page. Multiple quotes are counted once. Published dates are source dates, not necessarily conference occurrence dates.</p></section>`;
  const participation=`
  <section class="ls-panel"><div class="ls-two"><div>${heading('Doctors observed each month', 'Unique within each month; not additive')}<div class="ls-months ls-months-compact">${monthly('doctors', doctorMax)}</div></div><div>${heading('Most observed doctors', 'Captured activities, not an influence ranking')}<div class="ls-hbars">${voices.map(([name,n])=>`<button class="ls-hbar ls-static" data-ls-doctor="${e(name)}"><span class="ls-hbar-label">${e(name)}</span><span class="ls-hbar-track"><i class="ls-single" style="width:${n/(voices[0]?.[1]||1)*100}%"></i></span><b>${n}</b></button>`).join('') || empty('No doctors captured for these filters.')}</div></div></div></section>
  `;
  return panel==='activity'?activity:panel==='participation'?participation:activity+participation;
}

function dashboard(set) {
  const topics=conversationSignals(set,SOURCE_LINKS,dashboardWindow());
  const contrasting=topics.filter(t=>t.contrastingSignals);
  const recent=[...set].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const distinct=[...new Map(recent.map(r=>[`${r.who}|${r.source}`,r])).values()].slice(0,3);
  return `<section class="ls-panel ls-decision">${heading('What deserves your attention', `${topics.length} topics in the captured conversation`)}<div class="ls-signal-grid">${topics.slice(0,3).map((t,i)=>`<article class="ls-signal"><small>${i===0?'WIDEST DOCTOR PARTICIPATION':'LEADING DISCUSSION'}</small><h3>${e(t.topic)}</h3><div class="ls-signal-numbers"><strong>${t.doctors}<span>doctors</span></strong><strong>${t.activities}<span>activities</span></strong></div><div class="ls-signal-actions"><button class="text-button" data-topic-evidence="${e(t.topic)}">Read the evidence &#8594;</button><button class="quiet-button" data-follow-topic="${e(t.topic)}" aria-pressed="${followedTopics.includes(t.topic)}">${followedTopics.includes(t.topic)?'Following':'Follow topic'}</button></div></article>`).join('')||empty('No captured discussion matches this selection.')}</div></section>
  <section class="ls-panel"><div class="ls-two"><div>${heading('Where reactions differ', `${contrasting.length} topics`)}<div class="ls-contrast">${contrasting.slice(0,4).map(t=>`<button data-topic-evidence="${e(t.topic)}"><b>${e(t.topic)}</b><span><i class="ls-pos-text">${t.positive} positive</i><i class="ls-neg-text">${t.negative} negative</i></span><span aria-hidden="true">&#8594;</span></button>`).join('')||empty('Not enough contrasting statements in this selection.')}<small>Topic-level coding, not proof of direct disagreement or brand sentiment.</small></div></div><div>${heading('Your followed topics', 'Saved on this device')}<div class="ls-followed">${followedTopics.map(topic=>`<div><button class="text-button" data-topic-evidence="${e(topic)}">${e(topic)} &#8594;</button><button class="quiet-button" data-follow-topic="${e(topic)}" aria-label="Unfollow ${e(topic)}">&#215;</button></div>`).join('')||empty('No followed topics yet.')}</div></div></div></section>
  <section class="ls-panel">${heading('Latest captured viewpoints', 'Attribution and original source')}<div class="ls-latest">${distinct.map(r=>`<article><div class="ls-latest-meta"><b>${e(r.who)}</b><small>${fmtDate(r.date)} · ${e(r.channel)}</small></div><p>${e(r.text)}</p>${srcLink(r.source)}<button class="text-button" data-ls-doctor="${e(r.who)}">All captured statements &#8594;</button></article>`).join('')||empty('No captured viewpoints match.')}</div></section>
  <details class="ls-more ls-activity-detail"><summary>Activity by month & source coverage</summary>${activityDashboard(set)}</details>`;
}

/* ---------- Views ---------- */
function socialActivityChart() {
  const interactions=cohortData?.interactions||[],posts=cohortData?.posts||[];
  const entries=[['Posts',posts.length,'#167d9a'],['Likes',interactions.filter(r=>r.activityType==='LIKE').length,'#b35785'],['Comments',interactions.filter(r=>r.activityType==='COMMENT').length,'#4469ac'],['Reposts',interactions.filter(r=>r.activityType==='REPOST').length,'#997127']];
  const max=Math.max(1,...entries.map(r=>r[1]));
  return `<section class="ls-panel"><h2>Social Activity</h2><p>Verified actions by cohort doctors · All captured dates</p><div class="ls-social-activity" role="img" aria-label="Captured social activity: ${entries.map(([l,n])=>`${l} ${n}`).join(', ')}">${entries.map(([label,n,color])=>`<div class="ls-social-activity-row"><strong>${label}</strong><meter min="0" max="${max}" value="${n}" style="accent-color:${color}">${n}</meter><b>${n}</b></div>`).join('')}</div>${entries.every(r=>r[1]===0)?'<p>No verified native social activity captured yet. This does not mean doctors are inactive.</p>':''}<p class="chart-caption">Likes and reposts are actions, not endorsements or authored statements. Article mentions are counted separately. These counts measure actions by doctors, not engagement received on their posts.</p></section>`;
}

function overview(set) {
  const s = LISTENING_SUMMARY;
  return `<section class="ls-panel"><p class="chart-eyebrow">EXECUTIVE SUMMARY</p><h2 class="ls-headline">${e(s.headline)}</h2>
    <div class="ls-summary"><div class="ls-story"><p class="chart-eyebrow">THE STORY IN ONE PARAGRAPH</p><p>${bold(s.story)}</p></div>
    <div class="ls-leadership"><p class="chart-eyebrow">THREE THINGS TO TELL YOUR LEADERSHIP</p><ol>${s.leadership.map(x => `<li><span><b>${e(x.lead)}</b> ${e(x.body)}</span></li>`).join('')}</ol></div></div></section>
  <section class="ls-panel">${heading('Eight signals from the corpus', 'Select a signal to open its evidence')}
    <div class="ls-insights">${s.insights.map((x, i) => {
      const n = x.theme ? set.filter(r => r.themes.includes(x.theme)).length : null;
      const target = x.theme ? `data-ls-theme="${e(x.theme)}"` : x.specialtyView ? 'data-ls-go="voices"' : 'data-ls-go="channels"';
      return `<article class="ls-insight"><div class="ls-insight-top"><span class="coverage-tier-pill">${e(x.tag)}</span>${n !== null ? `<small>${n} in view</small>` : ''}</div><h3>${e(x.title)}</h3><p>${e(x.body)}</p>${x.quote ? `<blockquote>${e(x.quote)}<cite>${e(x.by)}</cite></blockquote>` : ''}<button class="text-button" type="button" ${target}>${x.theme ? 'Show the evidence' : x.specialtyView ? 'See who is critical' : 'See source coverage'} &#8594;</button></article>`;
    }).join('')}</div></section>`;
}

function voices(set) {
  const specs = [...groupBy(set, 'specialty')].sort((a, b) => b[1].length - a[1].length);
  const max = Math.max(1, ...specs.map(([, v]) => v.length));
  const bars = specs.map(([name, v]) => { const sp = splitOf(v), n = netOf(v); return `<button class="ls-hbar ${state.filters.specialty === name ? 'selected' : ''}" type="button" data-ls-spec="${e(name)}" aria-pressed="${state.filters.specialty === name}" title="${e(name)}: ${sp[0]} negative, ${sp[1]} mixed, ${sp[2]} positive"><span class="ls-hbar-label">${e(name)}</span><span class="ls-hbar-track"><span class="ls-split" style="width:${v.length / max * 100}%">${sp.map((c, i) => c ? `<i class="ls-${['neg', 'mix', 'pos'][i]}" style="flex:${c}"></i>` : '').join('')}</span></span><b>${v.length}</b><em class="ls-${netClass(n)}-text">${signed(n)}</em></button>`; }).join('');
  const heatRows = specs.map(([name, v]) => `<tr><th scope="row">${e(name)}</th>${THEMES.map(t => { const c = v.filter(r => r.themes.includes(t.name)); if (!c.length) return '<td class="ls-heat-empty"></td>'; if (state.heat === 'volume') return `<td style="--a:${Math.min(1, .18 + c.length / 8)}" class="ls-heat-vol" title="${e(name)} · ${e(t.name)}: ${c.length}">${c.length}</td>`; const n = netOf(c); return `<td class="ls-heat-net ls-${netClass(n)}-cell${Math.abs(n) < 60 ? ' ls-cell-light' : ''}" style="--a:${.25 + Math.abs(n) / 140}" title="${e(name)} · ${e(t.name)}: net ${signed(n)} (${c.length})">${signed(n)}</td>`; }).join('')}</tr>`).join('');
  const profiles = specs.map(([name, v]) => {
    const n = netOf(v), tcount = THEMES.map(t => [t.name, v.filter(r => r.themes.includes(t.name)).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const q = [...v].sort((a, b) => (b.date||'').localeCompare(a.date||''))[0];
    return `<article class="ls-profile"><div class="ls-profile-head"><h3>${e(name)}</h3>${netPill(n)}</div><small>${v.length} statement${v.length > 1 ? 's' : ''} · ${new Set(v.map(r => r.who)).size} voice${new Set(v.map(r => r.who)).size > 1 ? 's' : ''}</small>${splitBar(splitOf(v), v.length)}<p>${e(SPECIALTY_PROFILES[name] || '')}</p><div class="ls-chips">${tcount.map(([t, c]) => `<span>${e(t)} · ${c}</span>`).join('')}</div><blockquote class="ls-edge-${sentClass(q.sentiment)}">${e(q.text)}<cite>${e(q.who)} · ${fmtDate(q.date)}</cite>${disclosure(q)}</blockquote></article>`;
  }).join('');
  const voiceCards = KEY_VOICES.map(k => ({ ...k, rows: set.filter(r => r.who === k.who) })).filter(k => k.rows.length).map(k => {
    const first = k.rows[0];
    return `<button class="ls-voice" type="button" data-ls-voice="${e(k.who)}"><span class="ls-voice-top"><span class="ls-monogram" aria-hidden="true">${e(initials(k.who))}</span><span><small>${e(k.tier)}</small><b>${e(k.who)}</b><span>${e(first.role)}</span></span><span class="ls-count">${k.rows.length}×</span></span>${splitBar(splitOf(k.rows), k.rows.length)}<span class="ls-voice-quote">${e(first.text)}</span><span class="ls-voice-foot">${e(first.specialty)} · latest ${fmtDate(first.date)}</span>${disclosure(first)}</button>`;
  }).join('');
  return `<section class="ls-panel"><p class="ls-lede">${e(WHO_LEDE)}</p>
    <div class="ls-two"><div>${heading('Statements by specialty and sentiment', 'Net = positive share minus negative share')}${legend()}<div class="ls-hbars">${bars || empty('No statements match these filters.')}</div><p class="chart-caption">Select a specialty to filter every view. Select it again to clear.</p></div>
    <div>${heading('Where each specialty focuses', `<span class="segmented ls-seg" role="group" aria-label="Heatmap measure"><button type="button" data-ls-heat="volume" class="${state.heat === 'volume' ? 'active' : ''}" aria-pressed="${state.heat === 'volume'}">Volume</button><button type="button" data-ls-heat="net" class="${state.heat === 'net' ? 'active' : ''}" aria-pressed="${state.heat === 'net'}">Net sentiment</button></span>`)}<div class="table-scroll ls-heat-wrap"><table class="ls-heat"><thead><tr><th></th>${THEMES.map(t => `<th scope="col"><span>${e(t.name)}</span></th>`).join('')}</tr></thead><tbody>${heatRows}</tbody></table></div><p class="chart-caption">A statement can touch more than one theme. ${state.heat === 'volume' ? 'Darker cells hold more statements.' : 'Blue leans positive, red leans negative.'}</p></div></div></section>
  <section class="ls-panel">${heading('Specialty profiles', `${specs.length} specialties in view`)}<div class="ls-profiles">${profiles || empty('No statements match these filters.')}</div></section>
  <section class="ls-panel">${heading('The people shaping specialist opinion', 'Most-quoted voices · select a card for every statement')}<div class="ls-voices">${voiceCards || empty('None of the key voices appear under these filters.')}</div></section>`;
}

function themes(set) {
  const stats = THEMES.map(t => { const v = set.filter(r => r.themes.includes(t.name)); return { ...t, rows: v, net: netOf(v), split: splitOf(v) }; }).sort((a, b) => b.net - a.net);
  const maxN = Math.max(1, ...stats.map(s => s.rows.length));
  const diverging = stats.map(s => { const [neg, mix, pos] = s.split; return `<div class="ls-div-row"><span>${e(s.name)}</span><span class="ls-div-track"><span class="ls-div-left"><i class="ls-neg" style="width:${neg / maxN * 100}%"></i><i class="ls-mix" style="width:${mix / 2 / maxN * 100}%"></i></span><span class="ls-div-right"><i class="ls-mix" style="width:${mix / 2 / maxN * 100}%"></i><i class="ls-pos" style="width:${pos / maxN * 100}%"></i></span></span><em class="ls-${netClass(s.net)}-text">${s.rows.length ? signed(s.net) : '—'}</em></div>`; }).join('');
  const shift = themeShift(set), smax = Math.max(10, ...shift.flatMap(x => [x.y2025, x.y2026]));
  const shiftRows = shift.map(x => `<div class="ls-shift-row"><span>${e(x.name)}</span><span class="ls-shift-bars"><i class="ls-y25" style="width:${x.y2025 / smax * 100}%" title="2025: ${Math.round(x.y2025)}% (${x.n2025})"></i><i class="ls-y26" style="width:${x.y2026 / smax * 100}%" title="2026: ${Math.round(x.y2026)}% (${x.n2026})"></i></span><em>${x.delta > 0 ? '▲' : x.delta < 0 ? '▼' : '·'} ${signed(x.delta)} pts</em></div>`).join('');
  const accordions = stats.map(s => { const d = THEME_DETAIL[s.name]; return `<details class="ls-theme" ${state.openTheme === s.name ? 'open' : ''} data-ls-open="${e(s.name)}"><summary><div><b>${e(s.name)}</b><small>${e(s.detail)}</small></div><span class="ls-count-pill">${s.rows.length} statements</span>${netPill(s.net)}</summary><div class="ls-theme-body"><div class="ls-points">${d.points.map(([h, p]) => `<div><b>${e(h)}</b><p>${e(p)}</p></div>`).join('')}</div><div class="ls-sowhat"><span>So what</span><p>${e(d.soWhat)}</p></div>${s.rows.map(statementItem).join('') || empty('No statements for this theme under the current filters.')}</div></details>`; }).join('');
  return `<section class="ls-panel"><div class="ls-two"><div>${heading('Net sentiment by theme', 'Negative left · positive right · mixed centred')}${legend()}<div class="ls-div">${diverging}</div></div>
    <div>${heading('How the agenda shifted, 2025 vs 2026', 'Share of each year’s statements')}<div class="ls-legend"><span><i class="ls-y25"></i>2025</span><span><i class="ls-y26"></i>2026</span></div><div class="ls-shift">${shiftRows}</div><p class="chart-caption">Shares are computed from the statements in view. Hover a bar for the count.</p></div></div></section>
  <section class="ls-panel">${heading('Talking points, verbatim evidence and implications', 'Sorted by net sentiment')}<div class="ls-themes">${accordions}</div></section>`;
}

function channels(set) {
  const ch = [...groupBy(set, 'channel')].sort((a, b) => b[1].length - a[1].length), max = Math.max(1, ...ch.map(([, v]) => v.length));
  const fr = FRAMINGS.map(f => [f, set.filter(r => r.framing === f)]), fmax = Math.max(1, ...fr.map(([, v]) => v.length));
  const status = Object.keys(SOURCE_STATUS).map(k => [k, SOURCE_COVERAGE.flatMap(g => g.rows).filter(r => r[1] === k).length]);
  return `<section class="ls-panel"><p class="ls-lede">${e(CHANNEL_LEDE)}</p><div class="ls-two">
    <div>${heading('Where statements appear', 'Channel of first appearance')}${legend()}<div class="ls-hbars">${ch.map(([name, v]) => { const sp = splitOf(v); return `<button class="ls-hbar ${state.filters.channel === name ? 'selected' : ''}" type="button" data-ls-channel="${e(name)}" aria-pressed="${state.filters.channel === name}" title="${e(name)}: ${sp[0]} negative, ${sp[1]} mixed, ${sp[2]} positive"><span class="ls-hbar-label">${e(name)}</span><span class="ls-hbar-track"><span class="ls-split" style="width:${v.length / max * 100}%">${sp.map((c, i) => c ? `<i class="ls-${['neg', 'mix', 'pos'][i]}" style="flex:${c}"></i>` : '').join('')}</span></span><b>${v.length}</b><em class="ls-${netClass(netOf(v))}-text">${signed(netOf(v))}</em></button>`; }).join('') || empty('No statements match these filters.')}</div></div>
    <div>${heading('How statements are framed', 'What each statement is trying to do')}<div class="ls-hbars">${fr.map(([name, v]) => `<div class="ls-hbar ls-static"><span class="ls-hbar-label">${e(name)}</span><span class="ls-hbar-track"><i class="ls-frame ls-frame-${name.split(' ')[0].toLowerCase()}" style="width:${v.length / fmax * 100}%"></i></span><b>${v.length}</b><em class="ls-${netClass(netOf(v))}-text">${v.length ? signed(netOf(v)) : ''}</em></div>`).join('')}</div><p class="chart-caption">Caution statements are almost all negative, advocacy statements all positive. Education and gatekeeping carry the mixed middle.</p></div></div></section>
  <section class="ls-panel">${heading('Video, podcast and recorded-interview inventory', 'Listed as channel evidence · not coded as statements')}<div class="ls-videos">${VIDEO_INVENTORY.map(([t, s]) => `<div><span class="ls-play" aria-hidden="true"></span><b>${e(t)}</b><small>${e(s)}</small></div>`).join('')}</div><p class="chart-caption">Found on YouTube, MEDtalks and news channels. Titles are shown as published. The pages could not be read automatically because of rate limits.</p></section>
  <section class="ls-panel" id="lsSources">${heading('Every source requested, and what it produced', `${SOURCE_COVERAGE.flatMap(g => g.rows).length} source types scanned`)}
    <div class="ls-status-strip">${status.map(([k, n]) => `<div class="ls-status-${k.toLowerCase()}"><strong>${n}</strong><span>${e(SOURCE_STATUS[k])}</span></div>`).join('')}</div>
    <p class="chart-caption">Captured means attributable specialist statements were coded. Scanned means the source was searched or read but had no attributable specialist statement in the window. Restricted means login walls, robots rules or closed groups stopped automated collection; these need a licensed listening tool or manual panel review in the next wave.</p>
    <div class="table-scroll"><table class="doctor-table ls-source-table"><thead><tr><th>Source</th><th>Status</th><th>What we found</th><th>Coded</th></tr></thead><tbody>${SOURCE_COVERAGE.map(g => `<tr class="ls-group"><th colspan="4" scope="colgroup">${e(g.group)}</th></tr>${g.rows.map(([name, st, found, n]) => `<tr><td><b>${e(name)}</b></td><td><span class="ls-status ls-status-${st.toLowerCase()}">${e(SOURCE_STATUS[st])}</span></td><td>${e(found)}</td><td class="ls-num">${n ?? '—'}</td></tr>`).join('')}`).join('')}</tbody></table></div></section>`;
}

function timeline(set) {
  const byQ = QUARTERS.map(q => [q, set.filter(r => quarterOf(r.date) === q)]), max = Math.max(1, ...byQ.map(([, v]) => v.length));
  const types = [...new Set(EVENTS.map(x => x.type))];
  const events = EVENTS.filter(x => !state.eventType || x.type === state.eventType);
  const costMax = 28000, matMax = Math.max(...MARKET.classMat.map(x => x[1])), shareMax = Math.max(...MARKET.genericShare.map(x => x[1]));
  return `<section class="ls-panel"><p class="ls-lede">${e(TIMELINE_LEDE)}</p><div class="ls-two ls-two-wide">
    <div>${heading('Statements per quarter by sentiment', 'Hover a column for counts')}${legend()}<div class="ls-cols" role="img" aria-label="Stacked columns of statements per quarter by sentiment">${byQ.map(([q, v]) => { const sp = splitOf(v); const [y, qq] = q.split(' '); return `<div class="ls-col ${q === '2026 Q1' ? 'ls-col-marked' : ''}" title="${q}: ${v.length} statements · ${sp[0]} negative, ${sp[1]} mixed, ${sp[2]} positive"><b>${v.length || ''}</b><span class="ls-col-stack" style="height:${v.length / max * 100}%">${[2, 1, 0].map(i => sp[i] ? `<i class="ls-${['neg', 'mix', 'pos'][i]}" style="flex:${sp[i]}"></i>` : '').join('')}</span><small>${qq}${qq === 'Q1' ? `<br>${y}` : ''}</small></div>`; }).join('')}</div><p class="chart-caption">The marked quarter contains the semaglutide patent expiry on 20 Mar 2026.</p></div>
    <div>${heading('Events that shaped the conversation', `${events.length} events`)}<div class="segmented ls-seg ls-event-filter" role="group" aria-label="Event type"><button type="button" data-ls-event="" class="${!state.eventType ? 'active' : ''}">All</button>${types.map(t => `<button type="button" data-ls-event="${e(t)}" class="${state.eventType === t ? 'active' : ''}">${e(t)}</button>`).join('')}</div><ol class="ls-events">${events.map(x => `<li class="ls-ev-${x.type.split(' ')[0].toLowerCase()}"><small>${e(x.date)} · ${e(x.type)}</small><p>${e(x.text)}</p></li>`).join('')}</ol></div></div></section>
  <section class="ls-panel">${heading('What the market is doing while specialists debate', 'Secondary data · not part of the sentiment corpus')}<p class="ls-lede">${e(MARKET.lede)}</p>
    <div class="ls-market-kpis">${MARKET.kpis.map(([v, l]) => `<div><strong>${e(v)}</strong><span>${e(l)}</span></div>`).join('')}</div>
    <div class="ls-three">
      <div>${heading('GLP-1 class value, moving annual total', '₹ crore · Pharmarack PharmaTrac')}<div class="ls-hbars">${MARKET.classMat.map(([l, v]) => `<div class="ls-hbar ls-static"><span class="ls-hbar-label">${e(l)}</span><span class="ls-hbar-track"><i class="ls-single" style="width:${v / matMax * 100}%"></i></span><b>₹${v.toLocaleString('en-IN')} cr</b></div>`).join('')}</div></div>
      <div>${heading('Monthly cost ranges, dose-dependent', '₹ per month · Mar–Jul 2026')}<div class="ls-ranges">${MARKET.costRanges.map(([l, lo, hi]) => `<div><span>${e(l)}</span><span class="ls-range-track"><i style="left:${lo / costMax * 100}%;width:${(hi - lo) / costMax * 100}%"></i></span><b>₹${lo.toLocaleString('en-IN')}–${hi.toLocaleString('en-IN')}</b></div>`).join('')}<div class="ls-range-axis"><span></span><span class="ls-range-ticks">${[0, 7, 14, 21, 28].map(t => `<i style="left:${t / 28 * 100}%">₹${t}k</i>`).join('')}</span><span></span></div></div></div>
      <div>${heading('Generic semaglutide share by company', 'Apr 2026 · value share')}<div class="ls-hbars">${MARKET.genericShare.map(([l, v]) => `<div class="ls-hbar ls-static"><span class="ls-hbar-label">${e(l)}</span><span class="ls-hbar-track"><i class="${l === 'Others' ? 'ls-mix' : 'ls-single'}" style="width:${v / shareMax * 100}%"></i></span><b>${v}%</b></div>`).join('')}</div><p class="chart-caption">${e(MARKET.genericNote)}</p></div>
    </div></section>`;
}

function actions() {
  const teams = Object.keys(TEAM_ACTIONS);
  return `<section class="ls-panel">${heading('What each team should do next', 'Each action is tied to the listening signal behind it')}
    <div class="persona-tabs ls-team-tabs" role="tablist" aria-label="Team">${teams.map(t => `<button role="tab" type="button" data-ls-team="${e(t)}" aria-selected="${state.team === t}">${e(t)}</button>`).join('')}</div>
    <div class="ls-actions">${TEAM_ACTIONS[state.team].map(([signal, lead, rest], i) => `<article><span class="ls-action-n">0${i + 1}</span><div><p class="chart-eyebrow">LISTENING SIGNAL</p><p>${e(signal)}</p></div><div><p class="chart-eyebrow ls-accent">RECOMMENDED ACTION</p><p class="ls-action-text"><b>${e(lead)}</b> ${e(rest)}</p></div></article>`).join('')}</div></section>`;
}

function ledger(set) {
  const { key, dir } = state.sort;
  const sorted = [...set].sort((a, b) => { const va = key === 'themes' ? a.themes[0] : a[key], vb = key === 'themes' ? b.themes[0] : b[key]; return String(va).localeCompare(String(vb)) * dir || (b.date||'').localeCompare(a.date||''); });
  const th = (k, label) => `<th scope="col"><button type="button" data-ls-sort="${k}" aria-sort="${key === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${key === k ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  return `<section class="ls-panel">${heading('All coded statements', `${set.length} of ${ALL.length} statements · sorted by ${key === 'who' ? 'voice' : key}`)}
    <p class="chart-caption ls-ledger-note">Every statement behind the charts. The filters above apply here. Each source link opens the page the quote was taken from. ${e(LISTENING_META.corrections)}</p>
    <div class="table-scroll"><table class="doctor-table ls-ledger"><thead><tr>${th('date', 'Date')}${th('who', 'Who')}<th scope="col">What they said</th>${th('themes', 'Themes')}${th('sentiment', 'Sentiment')}${th('channel', 'Channel')}</tr></thead>
    <tbody>${sorted.map(r => `<tr><td class="ls-nowrap">${fmtDate(r.date)}${r.wave2 ? '<span class="ls-wave">wave 2</span>' : ''}</td><td><b>${e(r.who)}</b><small>${e(r.role)}</small><small class="ls-spec">${e(r.specialty)}</small></td><td>${e(r.text)}${r.paraphrased ? ' <em>(paraphrased)</em>' : ''}<small>${srcLink(r.source)}</small>${r.correction ? `<small class="ls-correction">Note: ${e(r.correction)}</small>` : ''}</td><td><div class="ls-chips">${r.themes.map(t => `<span>${e(t)}</span>`).join('')}</div></td><td>${sentPill(r.sentiment)}<small>${e(r.framing)}</small></td><td>${e(r.channel)}</td></tr>`).join('') || `<tr><td colspan="6">${empty('No statements match these filters.')}</td></tr>`}</tbody></table></div></section>`;
}

function method() {
  const sources = [...groupBy(ALL, 'source')].sort((a, b) => (b[1][0].date||'').localeCompare(a[1][0].date||''));
  return `<section class="ls-panel">${heading('How this was built, and its limits', 'THB listening wave 2')}<div class="ls-method">${METHOD.map(([h, items]) => `<div><h3>${e(h)}</h3><ul>${items.map(i => `<li>${e(i)}</li>`).join('')}</ul></div>`).join('')}</div></section>
  <section class="ls-panel">${heading('Source index', `${sources.length} publications behind the ${ALL.length} statements`)}<p class="chart-caption">${e(LISTENING_META.sourceLinksStatus)} ${e(LISTENING_META.corrections)} Analyst tiers on key-voice cards are classifications from the listening report, not clinical-authority scores.</p><ol class="ls-source-index">${sources.map(([s, v]) => `<li>${srcLink(s)}<small>${v.length} statement${v.length > 1 ? 's' : ''}${sourceLink(s)?.check === 'index' ? ' · matched on indexed text' : ''}${sourceLink(s)?.note ? ` · ${e(sourceLink(s).note)}` : ''}</small></li>`).join('')}</ol></section>`;
}

/* ---------- Voice dialog ---------- */
function openVoice(who) {
  rememberEvidenceContext();
  evidenceDoctor=who;
  go('ledger');
}

/* ---------- Render + routing ---------- */
function radialTopics(set) {
  const topics = conversationSignals(set,SOURCE_LINKS,dashboardWindow()).slice(0,8).map(t=>({name:t.topic,rows:set.filter(r=>r.themes.includes(t.topic))}));
  if(!topics.length)return empty('No recurring topics in this selection. Statements remain available under Doctors and Sources.');
  const short=topics.map(t=>{const words=t.name.split(' '),lines=[''];for(const word of words){if((lines[lines.length-1]+' '+word).trim().length>20)lines.push(word);else lines[lines.length-1]=(lines[lines.length-1]+' '+word).trim();}return lines;});
  const nodes = topics.map((t,i) => {
    const angle = -Math.PI/2 + i*2*Math.PI/topics.length;
    const x=380+Math.cos(angle)*258, y=280+Math.sin(angle)*192;
    const values=splitOf(t.rows), total=t.rows.length, circumference=2*Math.PI*42;
    let offset=0;
    const ring=values.map((n,j)=>{
      const length=total?n/total*circumference:0;
      const arc=`<circle cx="${x}" cy="${y}" r="42" fill="none" stroke="${['#d76568','#bac8d5','#2782b5'][j]}" stroke-width="9" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${x} ${y})"/>`;
      offset+=length;
      return arc;
    }).join('');
    return `<path d="M380 280 L${x} ${y}" class="ls-web-spoke" stroke-width="${1+Math.min(4,total/4)}"/><g role="button" tabindex="0" data-topic-evidence="${e(t.name)}" class="ls-web-node" aria-label="${e(t.name)}: ${total} captured statements. Open evidence."><title>${e(t.name)}: ${values[2]} positive, ${values[1]} mixed, ${values[0]} negative statements</title><circle cx="${x}" cy="${y}" r="47" fill="#fff"/>${ring}<text x="${x}" y="${y+7}" class="ls-web-count">${total}</text>${short[i].map((line,j)=>`<text x="${x}" y="${y+66+j*17}" class="ls-web-label">${e(line)}</text>`).join('')}</g>`;
  }).join('');
  return `<section class="ls-panel ls-web-panel">${heading('Topics in the captured conversation', 'Select a topic to explore the evidence')}<div class="ls-web-layout"><div class="ls-web-graphic"><svg viewBox="0 0 760 570" role="group" aria-label="Interactive topic map, with sentiment rings and statement counts"><circle cx="380" cy="280" r="136" class="ls-web-orbit"/><ellipse cx="380" cy="280" rx="258" ry="192" class="ls-web-orbit"/>${nodes}<circle cx="380" cy="280" r="78" fill="#103d50"/><text x="380" y="272" class="ls-web-centre">Discussion</text><text x="380" y="298" class="ls-web-sub">${set.length} statements</text></svg></div><aside class="ls-web-key"><span class="chart-eyebrow">CONVERSATION MAP</span><h3>${topics.filter(t=>t.rows.length).length} topics.<br>Multiple perspectives.</h3>${legend()}<p>Numbers count captured statements. Rings show their coded sentiment.</p><p>Topics overlap; counts are not additive.</p><small>${dashboardWindow().start}<br>to ${dashboardWindow().end}</small></aside></div></section>`;
}

function compactTopics(set) {
  const topics=conversationSignals(set,SOURCE_LINKS,dashboardWindow());
  const max=Math.max(5,Math.ceil(Math.max(0,...topics.map(t=>t.activities))/5)*5);
  const ticks=Array.from({length:6},(_,i)=>i*max/5);
  const chartRows=topics.map(t=>{
    const n=t.positive+t.negative+t.mixed;
    const net=n?Math.round((t.positive-t.negative)/n*100):0;
    return `<button class="ls-analytic-row" data-topic-evidence="${e(t.topic)}" title="${e(t.topic)}: ${t.activities} activities, ${t.doctors} doctors; ${t.positive} positive, ${t.mixed} mixed, ${t.negative} negative statements. Open evidence."><span class="ls-analytic-name">${e(t.topic)}</span><span class="ls-volume-plot"><i style="width:${t.activities/max*100}%"></i><b style="left:${t.activities/max*100}%">${t.activities}</b></span><span class="ls-analytic-doctors">${t.doctors}</span><span class="ls-net-plot"><i style="left:${(net+100)/2}%"></i><b style="left:${Math.min(88,Math.max(12,(net+100)/2))}%">${signed(net)}</b></span></button>`;
  }).join('');
  return `<section class="ls-panel ls-analytic-panel">${heading('What clinicians are discussing', 'Activity volume and coded sentiment')}<div class="ls-analytic-scroll"><div class="ls-analytic-chart"><div class="ls-analytic-head"><span>Topic</span><span>Public activities</span><span>Doctors</span><span>Net sentiment</span></div><div class="ls-analytic-axis"><span></span><span class="ls-volume-axis">${ticks.map(t=>`<i style="left:${t/max*100}%">${t}</i>`).join('')}</span><span></span><span class="ls-net-axis"><i>−100</i><i>0</i><i>+100</i></span></div>${chartRows||empty('No captured activities match these filters.')}</div></div><div class="ls-analytic-notes"><span>One activity = one attributed voice per source page. Topics overlap.</span><span>Net = positive % − negative % of coded statements; not brand sentiment.</span></div></section>`;
}
let doctorsPage=0;
let doctorReturnQuery=null;
function compactDoctors(set) {
  const summary=activitySummary(set,SOURCE_LINKS,dashboardWindow());
  const doctors=[...new Set(summary.activities.flatMap(a=>a.doctors))].map(name=>{
    const statements=set.filter(r=>doctorNames(r).includes(name)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const topics=[...groupBy(statements.flatMap(r=>r.themes.map(topic=>({topic}))), 'topic')].sort((a,b)=>b[1].length-a[1].length).slice(0,3).map(([topic])=>topic);
    return {name,statements,topics,count:summary.activities.filter(a=>a.doctors.includes(name)).length};
  }).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const pageSize=window.matchMedia('(max-width:700px)').matches?1:3;
  const pages=Math.max(1,Math.ceil(doctors.length/pageSize));doctorsPage=Math.min(doctorsPage,pages-1);
  return `<section class="ls-panel ls-doctor-directory">${heading('Who Is Discussing What',`${doctors.length} Doctors · Most Captured Activity First`)}<div class="ls-doctor-directory-labels"><span>Doctor & Clinical Role</span><span>Discussion & Latest Statement</span><span>Evidence</span></div>${doctors.slice(doctorsPage*pageSize,doctorsPage*pageSize+pageSize).map(d=>{
    const latest=d.statements[0],excerpt=latest.text.length>220?latest.text.slice(0,latest.text.lastIndexOf(' ',220))+'…':latest.text;
    return `<article class="ls-doctor-summary"><div><button class="text-button ls-doctor-name" data-ls-doctor="${e(d.name)}">${e(d.name)}</button><p>${e(latest.role)}</p><small>${e(latest.specialty)}</small></div><div><strong class="ls-doctor-topics">${d.topics.map(e).join(' · ')||'No Recurring Topic Identified'}</strong><p class="ls-doctor-excerpt">${e(excerpt)}</p><small>${fmtDate(latest.date)} · ${e(latest.channel)}${latest.paraphrased?' · Paraphrased':''}</small></div><div class="ls-doctor-evidence"><strong>${d.count}</strong><span>Public Activities</span><small>${d.statements.length} Statements</small><button class="quiet-button" data-ls-doctor="${e(d.name)}">View Evidence &#8594;</button></div></article>`;
  }).join('')||empty('No doctors match this selection.')}<footer class="ls-doctor-directory-footer"><p>Roles are source-reported. Activity counts are not authority rankings.</p><div class="ls-evidence-pagination"><button class="quiet-button" data-doctors-page="${doctorsPage-1}" ${doctorsPage===0?'disabled':''} aria-label="Previous doctors">&#8592;</button><span>${doctorsPage+1} / ${pages}</span><button class="quiet-button" data-doctors-page="${doctorsPage+1}" ${doctorsPage===pages-1?'disabled':''} aria-label="Next doctors">&#8594;</button></div></footer></section>`;
}

let selectedNarrative = '';
function executiveSignal(set) {
  const named=set.filter(r=>doctorNames(r).length&&SOURCE_LINKS[r.source]?.url);
  const topic=conversationSignals(named,SOURCE_LINKS,dashboardWindow())[0];
  if(!topic)return '';
  const statement=named.filter(r=>r.themes.includes(topic.topic)).sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
  return `<section class="ls-executive-signal"><div><p class="chart-eyebrow">IN FOCUS · ${e(lensValue||'ALL CAPTURED VOICES')}</p><h2>${e(statement.text)}</h2><p><strong>${e(statement.who)}</strong> · ${e(statement.role)}</p><small>${e(statement.date)} · ${statement.paraphrased?'Paraphrased statement':'Attributed statement'} · ${srcLink(statement.source)}</small></div><aside><span>${e(topic.topic)}</span><strong>${topic.doctors}</strong><p>named doctors discussing this topic; not necessarily endorsing this statement</p><button class="quiet-button" data-topic-evidence="${e(topic.topic)}">Inspect perspectives &#8594;</button></aside></section>`;
}
function portfolioComparison() {
  const set=baseRows();
  const groups=compareLens(set,lens,SOURCE_LINKS,dashboardWindow());
  const topics=conversationSignals(set,SOURCE_LINKS,dashboardWindow()).slice(0,4);
  const max=Math.max(1,...groups.map(g=>g.doctors));
  return `<section class="ls-portfolio"><div class="ls-portfolio-title"><div><p class="chart-eyebrow">CONVERSATION LANDSCAPE</p><h2>${e(LENSES[lens])}: which narratives are present?</h2></div><span>Distinct named doctors</span></div><div class="ls-portfolio-scroll"><table><thead><tr><th>${e(LENSES[lens])}</th><th>Participation</th>${topics.map(t=>`<th>${e(t.topic)}</th>`).join('')}</tr></thead><tbody>${groups.map(g=>`<tr class="${lensValue===g.value?'is-selected':''}"><th><button data-lens-focus="${e(g.value)}" aria-pressed="${lensValue===g.value}">${e(g.value)}</button></th><td><button class="ls-participation" data-lens-focus="${e(g.value)}" aria-label="${e(g.value)}: ${g.doctors} named doctors"><i style="width:${g.doctors/max*100}%"></i><b>${g.doctors}</b></button></td>${topics.map(t=>{const topic=g.topics.find(x=>x.topic===t.topic);return `<td>${topic?`<button class="ls-portfolio-cell" style="--cell-opacity:${.08+.65*topic.doctors/Math.max(1,g.doctors)}" data-lens-topic="${e(g.value)}" data-portfolio-topic="${e(t.topic)}" aria-label="${e(g.value)}, ${e(t.topic)}: ${topic.doctors} doctors; open evidence">${topic.doctors}</button>`:'<span aria-label="No captured doctor statements">—</span>'}</td>`;}).join('')}</tr>`).join('')||'<tr><td>No captured evidence in this selection.</td></tr>'}</tbody></table></div><p>Explicit statement mentions only; unspecified does not mean absent from the market. Rows can overlap. Counts are not market share or brand sentiment. Brand vocabulary currently covers Wegovy, Ozempic, Rybelsus, Mounjaro and Yurpeak.</p></section>`;
}
function narrativeDashboard(set) {
  const named=set.filter(r=>doctorNames(r).length && SOURCE_LINKS[r.source]?.url);
  const topics=conversationSignals(named,SOURCE_LINKS,dashboardWindow());
  const active=topics.find(t=>t.topic===selectedNarrative)||topics[0];
  if(!active)return `${empty(named.length?'Statements are available, but no recurring phrase matches this selection.':'No attributed doctor statements match these filters.')}<button class="quiet-button" data-ls-go="ledger">Open captured statements &#8594;</button>`;
  const statements=named.filter(r=>r.themes.includes(active.topic)).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));
  const lead=statements[0];
  // Compare different attributed voices, prioritising different coded perspectives.
  const counter=statements.find(r=>r.who!==lead.who && r.sentiment!==lead.sentiment)||statements.find(r=>r.who!==lead.who);
  const summary=activitySummary(named,SOURCE_LINKS,dashboardWindow());
  const max=Math.max(1,...topics.map(t=>t.doctors));
  const viewpoint=(r)=>`<article class="ls-viewpoint"><span class="ls-position">${e(r.framing)} · ${e(r.sentiment)}</span><p class="ls-viewpoint-text">${e(r.text)}</p><div class="ls-viewpoint-author"><strong>${e(r.who)}</strong><span>${e(r.role)}</span></div><small>${e(r.date)} · ${e(r.channel)}${r.paraphrased?' · Paraphrased':''}</small><div class="ls-viewpoint-actions">${srcLink(r.source)}<button class="text-button" data-voice-topic="${e(r.who)}" data-topic="${e(active.topic)}">Doctor's evidence &#8594;</button></div></article>`;
  return `<section class="ls-conversation-brief"><header class="ls-brief-heading"><div><p class="chart-eyebrow">SPECIALIST PERSPECTIVES</p><h2>What are clinicians saying?</h2></div><p><strong>${summary.doctors}</strong> named doctors <span>·</span> <strong>${summary.activities.length}</strong> doctor activities</p></header><div class="ls-brief-layout"><nav class="ls-narrative-picker" aria-label="Conversation topics"><p>Topics by doctor participation</p>${topics.map(t=>`<button data-narrative="${e(t.topic)}" aria-pressed="${t.topic===active.topic}"><span>${e(t.topic)}</span><strong>${t.doctors}</strong><i style="width:${t.doctors/max*100}%"></i></button>`).join('')}</nav><section class="ls-narrative-detail" aria-live="polite"><div class="ls-narrative-heading"><div><p class="chart-eyebrow">${active.doctors} DOCTORS · ${active.activities} ACTIVITIES</p><h3>${e(active.topic)}</h3></div><button class="quiet-button" data-topic-evidence="${e(active.topic)}">All evidence &#8594;</button></div><div class="ls-perspective-split">${viewpoint(lead)}${counter?viewpoint(counter):'<p class="ls-single-view">Only one attributed voice in this selection.</p>'}</div><p class="ls-brief-footnote">Latest attributed viewpoint and ${counter&&counter.sentiment!==lead.sentiment?'a differently coded perspective':'another available voice'}. Different sentiment does not establish disagreement. Roles are source-reported, not authority rankings.</p></section></div><footer class="ls-brief-coverage">Captured public-source evidence, not complete social-platform coverage. ${named.filter(r=>SOURCE_LINKS[r.source]?.check==='index').length} statements rely on search-index evidence.</footer></section>`;
}
function compactSources(set) {
  const summary=activitySummary(set,SOURCE_LINKS,dashboardWindow()),coverage=collectionCoverage(cohortData);
  const groups=[...groupBy(summary.activities,'channel')].sort((a,b)=>b[1].length-a[1].length);
  const max=Math.max(1,...groups.map(([,v])=>v.length));
  return `<section class="ls-panel ls-compact ls-source-screen">${heading('Evidence Sources',`${summary.sources} Source Pages in Selection`)}
    <div class="ls-two"><div><h3>Captured Activities</h3><div class="ls-topic-chart">${groups.map(([name,items])=>`<button class="ls-topic-row" data-channel-evidence="${e(name)}"><b>${e(name)}</b><span class="ls-topic-track"><span class="ls-single" style="width:${items.length/max*100}%"></span></span><strong>${items.length}</strong><span aria-hidden="true">&#8594;</span></button>`).join('')||empty('No captured sources match these filters.')}</div><p class="chart-caption">One attributed voice per source page. Counts follow the selected scope and period.</p></div>
    <div class="ls-collection-coverage"><h3>Collection Coverage</h3><p class="chart-caption">All ${coverage?.total.toLocaleString('en-IN')||'—'} Cohort Doctors · Completed Checks · All Dates</p>
    ${coverage?coverage.checks.map(c=>`<div class="ls-source-check" data-source-check="${c.id}"><span>${e(c.label)}</span><strong>${c.checked.toLocaleString('en-IN')} / ${c.total.toLocaleString('en-IN')}</strong><progress value="${c.checked}" max="${c.total||1}" aria-label="${e(c.label)}: ${c.checked} of ${c.total} doctors checked"></progress><small>${c.notEstablished.toLocaleString('en-IN')} Not Established</small><small>${c.checkedAt?'Checked '+e(c.checkedAt.slice(0,10)):'Check Date Unavailable'}</small></div>`).join(''):empty('Collection coverage unavailable.')}
    </div></div>
    ${coverage?`<footer class="ls-source-coverage-footer"><span><strong>${coverage.linkedAccountDoctors}</strong> ${coverage.linkedAccountDoctors===1?'Doctor':'Doctors'} With Linked Accounts</span><span><strong>${coverage.nativePosts}</strong> Native Posts Captured</span><button class="text-button" data-review-source-links>Review ${coverage.reviewLinks.toLocaleString('en-IN')} Source Links · ${coverage.doctorsWithReviewLinks.toLocaleString('en-IN')} Doctors &#8594;</button></footer>`:''}
    <p class="chart-caption">Discovery links and publication searches are not captured commentary. Live monitoring is not connected.</p></section>`;
}
function compactEvidence(set) {
  const sorted = [...set].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const size=briefMobile.matches?1:4;
  const pages = Math.max(1,Math.ceil(sorted.length/size)); evidencePage = Math.min(evidencePage,pages-1);
  return `<section class="ls-panel ls-compact ls-evidence-detail"><button class="text-button" data-ls-go="${evidenceOrigin}">&#8592; ${e(TABS.find(([id])=>id===evidenceOrigin)?.[1] || 'Dashboard')}</button>${heading(evidenceDoctor||state.filters.theme||'Selected Evidence',`${set.length} ${set.length===1?'Statement':'Statements'}`)}<div class="ls-evidence-page">${sorted.slice(evidencePage*size,evidencePage*size+size).map(statementItem).join('') || empty('No captured statements match this selection.')}</div>${pages>1?`<div class="ls-evidence-pagination"><button class="quiet-button" data-evidence-page="${evidencePage-1}" ${evidencePage===0?'disabled':''} aria-label="Previous page">&#8592;</button><span>${evidencePage+1} / ${pages}</span><button class="quiet-button" data-evidence-page="${evidencePage+1}" ${evidencePage===pages-1?'disabled':''} aria-label="Next page">&#8594;</button></div>`:''}</section>`;
}
function bind() {
  const p = root.querySelector('#lsPanel');
  p.querySelector('[data-review-source-links]')?.addEventListener('click',()=>{coverageStatus='SOURCES_DISCOVERED';coverageQuery='';coverageSpecialty='';coveragePage=0;go('coverage');});
  p.querySelectorAll('[data-cohort-specialty]').forEach(b=>b.onclick=()=>{coverageSpecialty=b.dataset.cohortSpecialty;coverageQuery='';coverageStatus='';coveragePage=0;go('coverage')});
  p.querySelector('#lsCoverageSpecialty')?.addEventListener('change',event=>{coverageSpecialty=event.target.value;coveragePage=0;render()});
  p.querySelector('#lsCoverageQuery')?.addEventListener('input',event=>{const position=event.target.selectionStart;coverageQuery=event.target.value;coveragePage=0;render();const input=root.querySelector('#lsCoverageQuery');input.focus();try{input.setSelectionRange(position,position)}catch{}});
  p.querySelector('#lsCoverageStatus')?.addEventListener('change',event=>{coverageStatus=event.target.value;coveragePage=0;render();});
  p.querySelectorAll('[data-coverage-page]').forEach(b=>b.onclick=()=>{coveragePage=Number(b.dataset.coveragePage);render()});
  p.querySelectorAll('[data-cohort-evidence]').forEach(b=>{
    const id=b.dataset.cohortEvidence;
    if(b.disabled){b.disabled=false;b.textContent='View Available Evidence →';b.onclick=()=>{location.hash=`#voices/profile/${encodeURIComponent(id)}/evidence`};}
    else b.onclick=()=>{const match=cohortData.resolutions.find(r=>r.cohortId===id);if(match){listeningScope='cohort';openVoice(match.name)}};
  });
  p.querySelectorAll('.ls-cohort-rows small a').forEach(a=>{
    if(a.textContent.includes('Publication'))a.hash+='/research';
  });
  p.querySelectorAll('[data-brief-topic]').forEach(b=>b.onclick=()=>{briefTopic=b.dataset.briefTopic;render();root.querySelector(`[data-brief-topic="${CSS.escape(briefTopic)}"]`)?.focus({preventScroll:true});});
  p.querySelectorAll('[data-brief-page]').forEach(b=>b.onclick=()=>{briefPage=Number(b.dataset.briefPage);briefTopic=executiveBrief(rows(),SOURCE_LINKS,dashboardWindow()).topics[briefPage*briefPageSize()]?.topic||'';render();});
  p.querySelectorAll('[data-brief-doctor]').forEach(b=>b.onclick=()=>{rememberEvidenceContext();evidenceDoctor=b.dataset.briefDoctor;if(b.dataset.briefDoctorTopic)state.filters.theme=b.dataset.briefDoctorTopic;syncControls();go('ledger');});
  p.querySelectorAll('[data-doctors-page]').forEach(button=>button.onclick=()=>{doctorsPage=Number(button.dataset.doctorsPage);render();window.scrollTo({top:0,behavior:'instant'});});
  p.querySelectorAll('[data-dashboard-screen]').forEach(button=>button.onclick=()=>{dashboardScreen=button.dataset.dashboardScreen;render();window.scrollTo({top:0,behavior:'instant'});root.querySelector(`[data-dashboard-screen="${dashboardScreen}"]`)?.focus({preventScroll:true});});
  p.querySelectorAll('[data-lens-focus]').forEach(button=>button.onclick=()=>{lensValue=lensValue===button.dataset.lensFocus?'':button.dataset.lensFocus;render();});
  p.querySelectorAll('[data-lens-topic]').forEach(button=>button.onclick=()=>{rememberEvidenceContext();lensValue=button.dataset.lensTopic;setFilter('theme',button.dataset.portfolioTopic,'ledger');});
  p.querySelectorAll('[data-narrative]').forEach(button=>button.onclick=()=>{selectedNarrative=button.dataset.narrative;render();root.querySelector(`[data-narrative="${CSS.escape(selectedNarrative)}"]`)?.focus();});
  p.querySelectorAll('[data-voice-topic]').forEach(b=>b.onclick=()=>{rememberEvidenceContext();evidenceDoctor=b.dataset.voiceTopic;setFilter('theme',b.dataset.topic,'ledger');});
  p.querySelectorAll('[data-follow-topic]').forEach(b => b.onclick = () => { const topic=b.dataset.followTopic;followedTopics=followedTopics.includes(topic)?followedTopics.filter(t=>t!==topic):[...followedTopics,topic];try{localStorage.setItem('ff-listening-topics',JSON.stringify(followedTopics));}catch{window.notify?.('Topic followed for this session; browser storage unavailable.');}render(); });
  p.querySelectorAll('[data-topic-evidence]').forEach(b => b.onclick = () => setFilter('theme',b.dataset.topicEvidence,'ledger'));
  p.querySelectorAll('.ls-web-node').forEach(node => node.onkeydown = ev => { if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();node.onclick();} });
  p.querySelectorAll('[data-channel-evidence]').forEach(b => b.onclick = () => setFilter('channel',b.dataset.channelEvidence,'ledger'));
  p.querySelectorAll('[data-evidence-page]').forEach(b => b.onclick = () => { evidencePage=Number(b.dataset.evidencePage);render();root.querySelector('#lsPanel').focus(); });
  p.querySelectorAll('[data-ls-month]').forEach(b => b.onclick = () => { rememberEvidenceContext();selectedMonth = b.dataset.lsMonth; go('ledger'); });
  p.querySelectorAll('[data-ls-doctor]').forEach(b => b.onclick = () => openVoice(b.dataset.lsDoctor));
  p.querySelectorAll('[data-ls-theme]').forEach(b => (b.onclick = () => { state.openTheme = b.dataset.lsTheme; setFilter('theme', b.dataset.lsTheme, 'themes'); }));
  p.querySelectorAll('[data-ls-go]').forEach(b => (b.onclick = () => go(b.dataset.lsGo)));
  p.querySelectorAll('[data-ls-spec]').forEach(b => (b.onclick = () => setFilter('specialty', state.filters.specialty === b.dataset.lsSpec ? '' : b.dataset.lsSpec)));
  p.querySelectorAll('[data-ls-channel]').forEach(b => (b.onclick = () => setFilter('channel', state.filters.channel === b.dataset.lsChannel ? '' : b.dataset.lsChannel)));
  p.querySelectorAll('[data-ls-heat]').forEach(b => (b.onclick = () => { state.heat = b.dataset.lsHeat; render(); }));
  p.querySelectorAll('[data-ls-voice]').forEach(b => (b.onclick = () => openVoice(b.dataset.lsVoice)));
  p.querySelectorAll('[data-ls-event]').forEach(b => (b.onclick = () => { state.eventType = b.dataset.lsEvent; render(); }));
  p.querySelectorAll('[data-ls-team]').forEach(b => (b.onclick = () => { state.team = b.dataset.lsTeam; render(); p.querySelector(`[data-ls-team="${CSS.escape(state.team)}"]`)?.focus(); }));
  p.querySelectorAll('[data-ls-sort]').forEach(b => (b.onclick = () => { const k = b.dataset.lsSort; state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'date' ? -1 : 1) }; render(); }));
  p.querySelectorAll('details[data-ls-open]').forEach(d => d.addEventListener('toggle', () => { if (d.open) state.openTheme = d.dataset.lsOpen; else if (state.openTheme === d.dataset.lsOpen) state.openTheme = ''; }));
}
function render() {
  renderCohortHeader();
  const evidenceDetail=state.tab==='ledger';
  root.querySelector('#lsCohortStrip').hidden=evidenceDetail;
  root.querySelector('.ls-navigation').hidden=evidenceDetail;
  if(!cohortData){root.querySelector('#lsPanel').innerHTML=empty(cohortError?'Cohort data unavailable.':'Loading cohort-linked evidence…');return;}
  const lensToolbar=root.querySelector('.ls-lens-toolbar');
  if(state.tab==='channels')root.querySelector('#lsControls').after(lensToolbar);
  else root.querySelector('#lsPanel').before(lensToolbar);
  root.querySelector('#lsTopicMethod').textContent=topicBasis==='discovered'?'Recurring phrases across at least two source labels and two voices in the corpus. Lexical candidates, not inferred clinical conclusions.':'Original report annotations; these are predefined categories, not discovered themes.';
  const comparisons=compareLens(baseRows(),lens,SOURCE_LINKS,dashboardWindow());
  const focus=root.querySelector('#lsLensValue');
  focus.innerHTML=`<option value="">All ${e(LENSES[lens].toLowerCase())} mentions</option>${comparisons.map(item=>`<option value="${e(item.value)}">${e(item.value)}</option>`).join('')}${lensValue&&!comparisons.some(item=>item.value===lensValue)?`<option value="${e(lensValue)}">${e(lensValue)} (no matches)</option>`:''}`;
  focus.value=lensValue;
  root.querySelectorAll('[data-lens]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lens===lens)));
  const set = rows();
  root.querySelectorAll('#lsControls label').forEach(label=>{label.hidden=state.tab==='coverage'&&!label.querySelector('#lsWindow')});
  root.querySelector('.ls-control-notes').hidden=state.tab==='coverage';
  renderMetrics(set);
  root.querySelector('#lsMetrics').hidden = true;
  root.querySelector('#lsCaption').textContent = `${listeningScope==='cohort'?'Shared cohort':'Broader context · Not cohort coverage'} · ${selectedMonth || `${dashboardWindow().start} to ${dashboardWindow().end}`} · ${set.length} captured statements`;
  if(state.tab==='overview'){const s=activitySummary(set,SOURCE_LINKS,dashboardWindow());root.querySelector('#lsCaption').textContent+=` · ${s.doctors} named doctors · ${s.activities.length} public activities`;}
  if(state.tab==='coverage')root.querySelector('#lsCaption').textContent=`${cohortData.cohortTotal.toLocaleString('en-IN')} cohort doctors · Activity window: ${selectedMonth||`${dashboardWindow().start} to ${dashboardWindow().end}`} · Missing activity is not inactivity`;
  if(evidenceDetail)root.querySelector('#lsCaption').textContent=[listeningScope==='cohort'?'Shared Cohort':'Broader Context',selectedMonth||(windowMode==='all'?'All Captured Dates':'Last 12 Months'),subject,...Object.values(state.filters).filter(Boolean),lensValue].filter(Boolean).join(' · ');
  root.querySelector('#lsFilterSummary').textContent = `Filters${activeFilterCount() || selectedMonth ? ` · ${activeFilterCount() + Number(Boolean(selectedMonth))} applied` : ''} · ${windowMode === '12' ? 'Last 12 Months' : 'All Captured Dates'}`;
  root.querySelectorAll('[data-ls-tab]').forEach(b => { const on = b.dataset.lsTab === state.tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  root.querySelector('#lsPanel').setAttribute('aria-label', state.tab === 'ledger' ? 'Selected evidence' : TABS.find(([id])=>id===state.tab)?.[1] || 'Listening');
  root.querySelector('#lsPanel').removeAttribute('aria-labelledby');
  root.querySelector('#lsControls').classList.toggle('ls-controls-muted', ['actions', 'method'].includes(state.tab));
  root.querySelector('#lsControls').hidden=state.tab==='overview'&&dashboardScreen==='social';
  root.querySelector('#lsFilterSummary').hidden=state.tab==='overview'&&dashboardScreen==='social';
  root.querySelector('#lsCohortStrip').hidden=state.tab==='overview'&&dashboardScreen==='social';
  if(state.tab==='overview'&&dashboardScreen==='social')root.querySelector('#lsCaption').textContent='Shared Cohort · All Captured Social Activity';
  const dashboardViews={brief:conversationBrief,landscape:portfolioComparison,topics:compactTopics,activity:set=>activityDashboard(set,'activity'),participation:set=>activityDashboard(set,'participation'),social:socialActivityChart,perspectives:narrativeDashboard};
  const dashboardNavigation=`<nav class="ls-dashboard-navigation" aria-label="Dashboard sections">${[['brief','Conversation Brief'],['landscape','Brand & Molecule'],['activity','Monthly Activity'],['participation','Doctor Participation'],['social','Social Activity']].map(([id,title])=>`<button data-dashboard-screen="${id}" ${id===dashboardScreen?'aria-current="page"':''}>${title}</button>`).join('')}</nav>`;
  const views = { overview: set => dashboardNavigation+dashboardViews[dashboardScreen](set), coverage:cohortCoverage, voices: compactDoctors, themes: radialTopics, channels: compactSources, ledger: compactEvidence };
  root.querySelector('#lsPanel').innerHTML = views[state.tab](set);
  root.querySelector('.ls-lens-toolbar').hidden=evidenceDetail||state.tab==='coverage'||(state.tab==='overview'&&dashboardScreen!=='landscape');
  bind();
}
function go(tab) {
  if (tab === 'ledger' && state.tab !== 'ledger') evidenceOrigin = state.tab;
  evidencePage = 0;
  const hash = `#listening/${tab}`;
  if (location.hash === hash) route(); else location.hash = hash;
}
function route() {
  const [base, tab] = location.hash.slice(1).split('/');
  if (base !== 'listening') return;
  if (typeof window.showView === 'function' && !document.querySelector('#listening')?.classList.contains('active-view')) window.showView('listening');
  const next = tab === 'ledger' || TABS.some(([id]) => id === tab) ? tab : 'overview';
  if(next!=='ledger'&&evidenceContext){
    Object.assign(state.filters,evidenceContext.filters);selectedMonth=evidenceContext.selectedMonth;lensValue=evidenceContext.lensValue;evidenceDoctor=evidenceContext.evidenceDoctor;evidenceContext=null;syncControls();
  }
  const changed = next !== state.tab;
  state.tab = next;
  render();
  if (changed) window.scrollTo({ top: 0, behavior: 'instant' });
}

if (root) {
  document.querySelector('#exportButton')?.addEventListener('click', event => {
    if (!document.querySelector('#listening.active-view')) return;
    event.stopImmediatePropagation();
    const set = rows(), summary = activitySummary(set, SOURCE_LINKS, dashboardWindow());
    const payload = { exported_at: new Date().toISOString(), corpus_updated: LISTENING_META.updated,
      window: dashboardWindow(), selected_month: selectedMonth || null, subject, topic_basis: topicBasis, lens, lens_value: lensValue, doctor: evidenceDoctor||null, filters: state.filters,
      ...summary, statement_records: set.map(r => ({ ...r, source_evidence: SOURCE_LINKS[r.source] })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'dolytics-listening.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, true);
  document.querySelector('#refreshButton')?.addEventListener('click', event => {
    if (!document.querySelector('#listening.active-view')) return;
    event.stopImmediatePropagation();
    // Reload the published corpus; this is not a live source-collection job.
    location.reload();
  }, true);
  shell();
  render();
  loadListeningCohort();
  briefMobile.addEventListener('change',()=>{briefPage=0;coveragePage=0;evidencePage=0;render()});
  window.addEventListener('hashchange', route);
  document.querySelectorAll('.nav-item,[data-jump]').forEach(button => button.addEventListener('click', () => {
    if ((button.dataset.view || button.dataset.jump) === 'listening') go(button.dataset.jump === 'listening' ? 'overview' : state.tab);
    else if (location.hash.startsWith('#listening')) history.replaceState(null, '', location.pathname + location.search);
  }));
  if (location.hash.startsWith('#listening')) route();
}
