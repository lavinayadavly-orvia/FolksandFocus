import {geographyCuts} from './geography.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#225e91','#735c88','#77aeb7','#d4b67a','#d8dfe8'];
export function renderGeography(root,people,{onOpenDoctor,selection=null,page=0}={}){
  const d=geographyCuts(people);
  const go=(state='',city='')=>{location.hash=`#analytics/geography${state?`/${encodeURIComponent(state)}${city?`/${encodeURIComponent(city)}`:''}`:''}`};
  if(selection){
    const rows=d.rows.filter(r=>(selection.state==='Unresolved'?r.state==='Location Unresolved':r.state===selection.state)&&(!selection.city||r.city===selection.city));
    const pages=Math.max(1,Math.ceil(rows.length/8));page=Math.min(page,pages-1);
    root.innerHTML=`<button class="quiet-button" data-back>&#8592; Geography</button><header class="an-heading"><div><span class="voices-eyebrow">Geographic Coverage</span><h2>${esc(selection.city||selection.state)}</h2></div><strong>${rows.length} Doctors</strong></header><div class="geo-table"><table><thead><tr><th>Doctor</th><th>City</th><th>Institution &amp; Source</th></tr></thead><tbody>${rows.slice(page*8,page*8+8).map(r=>{const url=r.person.footprints?.find(f=>f.type==='INSTITUTION'&&/^https?:\/\//.test(f.url))?.url;return `<tr><td><button data-doctor="${esc(r.person.id)}">${esc(r.person.name)}</button></td><td>${esc(r.city)}</td><td>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.person.affiliation)} &#8599;</a>`:esc(r.person.affiliation)}</td></tr>`}).join('')}</tbody></table></div><div class="persona-pager"><button data-prev ${page===0?'disabled':''} aria-label="Previous page">&#8592;</button><span>${page+1} / ${pages}</span><button data-next ${page===pages-1?'disabled':''} aria-label="Next page">&#8594;</button></div>`;
    root.querySelectorAll('tbody tr').forEach((tr,index)=>{
      const person=rows[page*8+index].person;
      if(person.practiceLocations?.length)tr.children[1].textContent=person.practiceLocations.join(', ');
      const source=person.geographyEvidence?.sourceUrl;
      const link=tr.children[2].querySelector('a');
      if(link&&/^https?:\/\//.test(source||'')){link.href=source;link.title=person.geographyEvidence.reported;}
    });
    const back=document.createElement('a');back.href='#analytics/geography';back.className='quiet-button';back.textContent='\u2190 Geography';root.querySelector('[data-back]').replaceWith(back);
    root.querySelectorAll('[data-doctor]').forEach(b=>b.onclick=()=>onOpenDoctor(b.dataset.doctor));
    for(const [key,delta] of [['prev',-1],['next',1]])root.querySelector(`[data-${key}]`).onclick=()=>renderGeography(root,people,{onOpenDoctor,selection,page:page+delta});
    return;
  }
  let x=0;
  const chart=d.states.map((s,i)=>{
    const width=s.count/Math.max(1,d.mapped)*1000,start=x;x+=width;let y=0;
    return s.cities.map((c,j)=>{const height=c.count/s.count*340,top=y;y+=height;const limit=Math.floor((width-18)/8);return `<a href="#analytics/geography/${encodeURIComponent(s.label)}/${encodeURIComponent(c.label)}" aria-label="${esc(s.label)}, ${esc(c.label)}: ${c.count} doctors"><rect x="${start}" y="${top}" width="${width}" height="${height}" fill="${colors[j%colors.length]}" stroke="white" stroke-width="1"/><title>${esc(s.label)} / ${esc(c.label)}: ${c.count} doctors</title>${width>100&&height>44?`<text x="${start+9}" y="${top+23}" fill="${j%colors.length<2?'white':'#142b3d'}">${esc(c.label.length>limit?c.label.slice(0,limit-1)+'…':c.label)}</text><text x="${start+9}" y="${top+42}" fill="${j%colors.length<2?'white':'#142b3d'}">${c.count}</text>`:''}</a>`}).join('')+(width>25?`<text x="${start+width/2}" y="363" text-anchor="middle" fill="#172e40">${i+1}</text>`:'');
  }).join('');
  root.innerHTML=`<header class="an-heading"><div><span class="voices-eyebrow">Analytics / Geography</span><h2>Where Are Our Clinical Voices?</h2></div></header><nav class="an-tabs" aria-label="Analytics Views"><a href="#analytics/geography" aria-current="page">Geography</a><a href="#analytics">Conversation</a><a href="#analytics/voices">Voices &amp; Influence</a><a href="#analytics/channels">Channels &amp; Timing</a></nav><div class="an-metrics"><div><strong>${d.total.toLocaleString('en-IN')}</strong><span>Profiles</span></div><div><strong>${d.mapped.toLocaleString('en-IN')}</strong><span>State-Mapped Doctors</span></div><div><strong>${d.states.length}</strong><span>States &amp; Union Territories</span></div><div><strong>${d.unresolved}</strong><button data-unresolved>Unresolved / Multiple States &#8599;</button></div></div><section class="geo-chart"><header><h3>State &amp; City Distribution</h3><span>Column width: doctors in state · Segment height: city share · Area: doctor count</span></header>${d.mapped?`<svg viewBox="0 0 1000 380" role="img" aria-label="Marimekko of ${d.mapped} doctors by state and city">${chart}</svg>`:'<p>No mapped locations available.</p>'}<div class="geo-key">${d.states.map((s,i)=>`<button data-state="${esc(s.label)}"><b>${i+1}</b> ${esc(s.label)} <strong>${s.count}</strong></button>`).join('')}</div></section><footer class="an-footnote">Each doctor counted once. Explicit cities in reported locations and institutional names are normalized; multi-city doctors within one state remain a separate segment. Unresolved and cross-state profiles are outside the chart. Geography covers the full visible cohort, not only doctors with captured commentary.</footer>`;
  root.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>go(b.dataset.state));
  root.querySelector('[data-unresolved]').textContent='Location Pending \u2197';
  if(d.multiState){
    const multi=document.createElement('button');multi.className='quiet-button';
    multi.textContent=`${d.multiState} Doctors Practise Across States \u2197`;
    multi.onclick=()=>go('Multiple States');root.querySelector('.geo-key').append(multi);
  }
  const notice=document.createElement('p');
  notice.className='geo-coverage-note';
  notice.textContent=`${d.located} of ${d.total.toLocaleString('en-IN')} doctors located; ${d.unresolved} pending. The chart shows ${d.mapped} single-state profiles; ${d.multiState} cross-state practices are listed separately.`;
  root.querySelector('.geo-chart').before(notice);
  root.querySelector('[data-unresolved]').onclick=()=>go('Unresolved');
}
