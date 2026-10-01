import {voiceDashboard} from './voice-dashboard.mjs';
import {personaGroups} from './persona-model.mjs';
import {formatTopicLabel} from './listening-analytics.mjs';
import {sponsorshipDisclosure,statementAttributionLabel} from './listening-evidence.mjs';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={'Positive':'#087e8b','Mixed / neutral':'#8295a5','Negative':'#b34b62','Not coded':'#d1d8df'};

export function renderVoiceDashboard(root,people,statements,{group='all',navigate,period='12',panel='words',evidence='all',onStateChange,onOpenDoctor,onOpenEvidence,title,detail=null}={}){
  onStateChange?.({period,panel,evidence,detail});
  const data=voiceDashboard(people,statements,{group,period,evidence});
  const name=title||personaGroups.find(g=>g.id===group)?.name||(group==='review'?'Awaiting Classification':'All Clinical Voices');
  const chart=(items,kind)=>items.length?`<div class="vd-bars">${items.slice(0,6).map(([label,n])=>`<div><span>${escape(formatTopicLabel(label))}</span><meter min="0" max="${Math.max(...items.map(r=>r[1]))}" value="${n}">${n}</meter><b>${n}</b></div>`).join('')}</div><small>${kind}</small>`:'<p class="vd-empty">No attributed statements in this selection.</p>';
  const topWords=data.words.slice(0,18),max=topWords[0]?.instances||1;
  root.innerHTML=`<div class="persona-breadcrumb"><button data-vd-back>&#8592; Dashboard</button></div>
    <header class="vd-heading"><div><h2 tabindex="-1">${escape(name)}</h2><span>${data.members.length.toLocaleString('en-IN')} Doctors${group==='all'?' in the Cohort':' in This Archetype'}</span></div><div class="vd-controls"><label>Period<select id="vdPeriod"><option value="12" ${period==='12'?'selected':''}>Last 12 Months</option><option value="all" ${period==='all'?'selected':''}>All Captured Dates</option></select></label><button class="quiet-button" data-vd-doctors>Doctor Directory &#8594;</button></div></header>
    <div class="vd-kpis">${[['Doctors in Conversation',data.doctors],['Attributed Statements',data.rows.length],['Source Articles',data.sources]].map(([l,n])=>`<div><strong>${n}</strong><span>${l}</span></div>`).join('')}<p>${period==='all'?'All captured dates':`${data.window.start} to ${data.window.end}`}<br>Published commentary; not posting volume.</p></div>
    ${!data.members.length?'<div class="vd-disclosure"><p>No collected experience records place doctors in this archetype yet.</p><button class="primary-button" data-vd-all>Explore All Clinical Voices &#8594;</button></div>':''}
    <nav class="vd-mobile-tabs" aria-label="Conversation Charts">${[['themes','Themes'],['sentiment','Sentiment'],['words','Word Cloud'],['frequency','Frequency']].map(([id,l])=>`<button data-vd-panel="${id}" aria-pressed="${panel===id}">${l}</button>`).join('')}</nav>
    <div class="vd-grid">
      <section data-chart="themes" class="${panel==='themes'?'vd-selected':''}"><h3>What They Are Discussing</h3>${chart(data.themes,'Statements per coded theme; one statement may cover several themes.')}</section>
      <section data-chart="sentiment" class="${panel==='sentiment'?'vd-selected':''}"><h3>Perspective &amp; Sentiment</h3><div class="vd-sentiment">${Object.entries(data.sentiments).map(([l,n])=>`<div><span><i style="background:${colors[l]}"></i>${escape(l)}</span><meter min="0" max="${Math.max(1,data.rows.length)}" value="${n}" style="--bar-color:${colors[l]}">${n}</meter><b>${n}</b></div>`).join('')}</div><small>Coded statement tone, not clinical evidence strength.</small></section>
      <section data-chart="words" class="${panel==='words'?'vd-selected':''}"><h3>Conversation Focus</h3><div class="vd-cloud" aria-label="Clinical Word Cloud">${topWords.map(w=>`<button data-vd-word="${escape(w.word)}" style="font-size:${20+Math.round(22*w.instances/max)}px" aria-label="${escape(w.label)}: ${w.instances} occurrences in ${w.statementIds.length} statements">${escape(w.label)}</button>`).join('')||'<p class="vd-empty">No attributed clinical terms captured in this selection.</p>'}</div><small>Clinical terms in captured statements · Size reflects mentions</small></section>
      <section data-chart="frequency" class="${panel==='frequency'?'vd-selected':''}"><h3>Most Frequent Words</h3>${chart(data.words.slice(0,6).map(w=>[w.label,w.instances]),'Occurrences in captured statements, not inferred original-post wording.')}</section>
    </div>`;
  const cloud=root.querySelector('[data-chart="words"]');
  cloud.classList.add('vd-cloud-lead');
  root.querySelector('.vd-kpis').before(cloud);
  root.querySelector('[data-vd-back]').onclick=()=>navigate('profiles');
  root.querySelector('[data-vd-doctors]').onclick=()=>navigate('directory');
  root.querySelector('[data-vd-all]')?.addEventListener('click',()=>navigate('conversations/all'));
  const evidenceLabel=document.createElement('label');
  evidenceLabel.innerHTML='Evidence<select id="vdEvidence"><option value="all">All Sources</option><option value="page">Page-Checked</option><option value="index">Search-Indexed</option></select>';
  root.querySelector('.vd-controls').insertBefore(evidenceLabel,root.querySelector('[data-vd-doctors]'));
  root.querySelector('#vdEvidence').value=evidence;
  const redraw=changes=>renderVoiceDashboard(root,people,statements,{group,navigate,period,panel,evidence,onStateChange,onOpenDoctor,onOpenEvidence,title,...changes});
  root.querySelector('#vdEvidence').onchange=event=>{redraw({evidence:event.target.value});root.querySelector('#vdEvidence').focus()};
  root.querySelector('#vdPeriod').onchange=event=>{redraw({period:event.target.value});root.querySelector('#vdPeriod').focus()};
  const openEvidence=(label,rows,selection)=>{
    let page=Number.isInteger(selection.page)?Math.max(0,selection.page):0;
    const size=window.matchMedia('(max-width:700px)').matches?1:2;
    const draw=()=>{
      const pages=Math.max(1,Math.ceil(rows.length/size));
      page=Math.min(page,pages-1);
      onStateChange?.({period,panel,evidence,detail:{...selection,page}});
      const memberIds=new Set(data.members.map(p=>p.id));
      root.innerHTML=`<div class="persona-breadcrumb"><button data-vd-return>&#8592; Back to ${escape(name)}</button></div>
        <header class="vd-heading"><div><h2 tabindex="-1">${escape(label)}</h2><span>${rows.length} Statements · ${new Set(rows.flatMap(r=>r.cohortIds).filter(id=>memberIds.has(id))).size} Doctors</span></div></header>
        <div class="persona-records vd-evidence-page">${rows.slice(page*size,(page+1)*size).map(row=>`<article>
          <div class="vd-speakers">${data.members.filter(p=>row.cohortIds.includes(p.id)).map(p=>`<a href="#voices/profile/${encodeURIComponent(p.id)}" data-vd-speaker="${escape(p.id)}">${escape(p.name)} &#8594;</a>`).join('')}</div>
          <small>${escape(row.date||'Date Unconfirmed')} · ${escape(statementAttributionLabel(row)||'Attributed Statement')} · ${row.paraphrased?'Paraphrased':'Attributed Text'}</small>
          <p>${escape(row.text)}</p><small>${escape(row.attributionNote||'Clinical evidence appraisal not established.')}</small>
          <small class="vd-source-disclosure">${escape(sponsorshipDisclosure(row)||'Sponsorship not established')}</small>
          ${/^https?:\/\//.test(row.sourceEvidence.url)?`<a href="${escape(row.sourceEvidence.url)}" target="_blank" rel="noopener">${escape(row.source)} &#8599;</a>`:''}
        </article>`).join('')||'<p>No statements in this selection.</p>'}</div>
        <footer class="persona-pager"><button data-vd-evidence-prev ${page===0?'disabled':''} aria-label="Previous evidence page">&#8592;</button><span>${page+1} / ${pages}</span><button data-vd-evidence-next ${page===pages-1?'disabled':''} aria-label="Next evidence page">&#8594;</button></footer>`;
      root.querySelector('[data-vd-return]').onclick=()=>onOpenEvidence?onOpenEvidence(null):redraw({});
      root.querySelector('[data-vd-evidence-prev]').onclick=()=>{page--;draw()};
      root.querySelector('[data-vd-evidence-next]').onclick=()=>{page++;draw()};
      root.querySelectorAll('[data-vd-speaker]').forEach(a=>a.onclick=event=>{
        if(onOpenDoctor&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onOpenDoctor(a.dataset.vdSpeaker)}
      });
      root.querySelector('h2').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
    };
    draw();
  };
  const chartEntries={
    themes:data.themes.slice(0,6).map(([label])=>[label,data.rows.filter(r=>r.themes?.includes(label))]),
    sentiment:Object.keys(data.sentiments).map(label=>[label,data.rows.filter(r=>(Object.hasOwn(data.sentiments,r.sentiment)?r.sentiment:'Not coded')===label)]),
    frequency:data.words.slice(0,6).map(w=>[w.label,data.rows.filter(r=>w.statementIds.includes(r.id))])
  };
  const bindChart=(kind,selector)=>root.querySelectorAll(selector).forEach((row,i)=>{
    const entries=chartEntries[kind];
    const [label,rows]=entries[i],button=document.createElement('button');
    button.type='button';button.className='vd-chart-row';
    button.setAttribute('aria-label',`${formatTopicLabel(label)}: ${rows.length} statements. Open evidence`);
    button.disabled=!rows.length;
    button.append(...row.childNodes);row.replaceWith(button);
    button.onclick=()=>onOpenEvidence?onOpenEvidence({kind,value:label,page:0}):openEvidence(formatTopicLabel(label),rows,{kind,value:label,page:0});
  });
  bindChart('themes','[data-chart="themes"] .vd-bars>div');
  bindChart('sentiment','[data-chart="sentiment"] .vd-sentiment>div');
  bindChart('frequency','[data-chart="frequency"] .vd-bars>div');
  root.querySelectorAll('[data-vd-panel]').forEach(b=>b.onclick=()=>{panel=b.dataset.vdPanel;onStateChange?.({period,panel,evidence});root.querySelectorAll('[data-chart]').forEach(s=>s.classList.toggle('vd-selected',s.dataset.chart===panel));root.querySelectorAll('[data-vd-panel]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
  root.querySelectorAll('[data-vd-word]').forEach(button=>button.onclick=()=>{
    const word=data.words.find(w=>w.word===button.dataset.vdWord),rows=data.rows.filter(r=>word.statementIds.includes(r.id));
    const selection={kind:'words',value:word.word,page:0};
    if(onOpenEvidence)onOpenEvidence(selection);else openEvidence(word.label,rows,selection);
  });
  chartEntries.words=data.words.map(w=>[w.word,data.rows.filter(r=>w.statementIds.includes(r.id))]);
  const dimensions={
    channel:r=>[r.channel||'Unspecified Channel'],
    month:r=>r.date?[r.date.slice(0,7)]:[],
    specialty:r=>data.members.filter(p=>r.cohortIds.includes(p.id)).map(p=>p.specialty||p.specialties?.[0]||'Unspecified Specialty'),
    archetype:r=>data.members.filter(p=>r.cohortIds.includes(p.id)).map(p=>p.persona||p.tier||'Unclassified'),
  };
  for(const [kind,values] of Object.entries(dimensions))chartEntries[kind]=[...new Set(data.rows.flatMap(values))].map(value=>[value,data.rows.filter(r=>values(r).includes(value))]);
  const restored=detail&&Object.hasOwn(chartEntries,detail.kind)?chartEntries[detail.kind].find(([label])=>label===detail.value):null;
  if(restored)openEvidence(formatTopicLabel(restored[0]),restored[1],detail);
}
