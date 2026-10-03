import {publicationAnalytics} from './publication-analytics.mjs';
import {personaGroups} from './persona-model.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let collection;
export async function renderPublicationAnalytics(root,people,{onOpenDoctor,group='all'}={}){
 root.innerHTML='<p role="status">Loading Publications...</p>';
 const loading=root.firstChild;
 try{
  if(!collection){const response=await fetch('/api/publication-collection');if(!response.ok)throw new Error('Publications unavailable');collection=await response.json();}
  if(root.firstChild!==loading)return;
 }catch{
  if(root.firstChild!==loading)return;
  root.innerHTML='<p>Publications Unavailable</p><button data-retry>Retry</button>';
  root.querySelector('[data-retry]').onclick=()=>renderPublicationAnalytics(root,people,{onOpenDoctor,group});return;
 }
 const d=publicationAnalytics(people,collection,group),axes=d.types.slice(0,6),max=Math.max(4,Math.ceil(Math.max(0,...axes.map(t=>t.count))/4)*4);
 const point=(i,r)=>[300+Math.sin(i*2*Math.PI/axes.length)*r,230-Math.cos(i*2*Math.PI/axes.length)*r];
 const points=r=>axes.map((_,i)=>point(i,r).join(',')).join(' ');
 const radar=axes.length>=3?`<svg viewBox="0 0 600 460" aria-label="Publications by type" class="pub-radar">${[.25,.5,.75,1].map(n=>`<polygon points="${points(145*n)}" fill="none" stroke="#d8e4e9"/><text x="308" y="${230-145*n}" class="pub-axis">${Math.round(max*n)}</text>`).join('')}${axes.map((t,i)=>{const [x,y]=point(i,145);return `<line x1="300" y1="230" x2="${x}" y2="${y}" stroke="#d8e4e9"/>`}).join('')}<polygon points="${axes.map((t,i)=>point(i,145*t.count/max).join(',')).join(' ')}" fill="#7342b522" stroke="#7342b5" stroke-width="3"/>${axes.map((t,i)=>{const [x,y]=point(i,145*t.count/max),[lx,ly]=point(i,192);return `<g data-type="${i}" tabindex="0" role="button" aria-label="${esc(t.label)}: ${t.count} publications"><circle cx="${x}" cy="${y}" r="14" fill="transparent"/><circle cx="${x}" cy="${y}" r="6" fill="#7342b5" stroke="white" stroke-width="2"/><text x="${lx}" y="${ly}" text-anchor="middle" class="pub-label">${t.label.split(' ').length>2?`<tspan x="${lx}" dy="-7">${esc(t.label.split(' ').slice(0,2).join(' '))}</tspan><tspan x="${lx}" dy="18">${esc(t.label.split(' ').slice(2).join(' '))}</tspan>`:esc(t.label)}</text></g>`}).join('')}</svg>`:'<p>Fewer Than Three Publication Types Available</p>';
 root.innerHTML=`<header class="an-heading"><div><span class="voices-eyebrow">Analytics / Research</span><h2>Who Is Publishing What?</h2></div><label>Clinical Voices<select data-group><option value="all">All Archetypes</option>${personaGroups.map(g=>`<option value="${esc(g.id)}" ${group===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label></header><nav class="an-tabs" aria-label="Analytics Views"><a href="#analytics/geography">Geography</a><a href="#analytics">Conversation</a><a href="#analytics/voices">Voices &amp; Influence</a><a href="#analytics/research" aria-current="page">Research &amp; Publications</a><a href="#analytics/channels">Channels &amp; Timing</a></nav><div class="pub-summary"><strong>${d.total} Publications</strong><span>${d.doctors} Doctors</span><span>${d.types.length} Publication Types</span></div><div class="pub-layout"><section><h3>Publication Profile</h3>${radar}<small>Number of Publications · Types May Overlap</small></section><section><h3>Publication Types</h3><div class="pub-type-list">${d.types.map((t,i)=>`<button data-type="${i}"><span>${esc(t.label)}</span><strong>${t.count} &#8599;</strong></button>`).join('')||'<p>No Linked Publications</p>'}</div></section></div>`;
 root.querySelector('[data-group]').onchange=e=>renderPublicationAnalytics(root,people,{onOpenDoctor,group:e.target.value});
 const open=(index,trigger)=>{
  const type=d.types[index];if(!type)return;
  const dialog=document.createElement('dialog');dialog.className='pub-drawer';dialog.setAttribute('aria-labelledby','pubDrawerTitle');
  dialog.innerHTML=`<header><div><h2 id="pubDrawerTitle">${esc(type.label)}</h2><p>${type.count} Publications · ${new Set(type.records.flatMap(r=>r.doctors.map(p=>p.id))).size} Doctors</p></div><button data-close aria-label="Close Publications">&#215;</button></header><label class="pub-search">Search Publications<input type="search" placeholder="Doctor, title or journal"></label><div data-records></div><footer><button data-prev aria-label="Previous Page">&#8592;</button><span data-page></span><button data-next aria-label="Next Page">&#8594;</button></footer>`;
  let page=0;const draw=()=>{
   const query=dialog.querySelector('input').value.trim().toLowerCase();
   const rows=type.records.filter(r=>[r.title,r.journal,...r.doctors.map(p=>p.name)].join(' ').toLowerCase().includes(query));
   const pages=Math.max(1,Math.ceil(rows.length/6));page=Math.min(page,pages-1);
   dialog.querySelector('[data-records]').innerHTML=`<table><thead><tr><th>Doctor</th><th>Publication</th><th>Date</th></tr></thead><tbody>${rows.slice(page*6,page*6+6).map(r=>`<tr><td>${r.doctors.map(p=>`<button data-doctor="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</td><td><a href="${esc(/^https?:/.test(r.url)?r.url:'#')}" target="_blank" rel="noopener">${esc(r.title)} &#8599;</a><small>${esc(r.journal)}</small></td><td>${esc(r.date||'Not Reported')}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<p>No Matching Publications</p>'}`;
   dialog.querySelector('[data-page]').textContent=`${rows.length} ${rows.length===1?'Result':'Results'} · ${page+1} / ${pages}`;
   dialog.querySelector('[data-records]').scrollTop=0;
   dialog.querySelector('[data-prev]').disabled=page===0;dialog.querySelector('[data-next]').disabled=page===pages-1;
   dialog.querySelectorAll('[data-doctor]').forEach(b=>b.onclick=()=>{dialog.close();onOpenDoctor(b.dataset.doctor)});
  };
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('input').oninput=()=>{page=0;draw()};
  dialog.querySelector('[data-prev]').onclick=()=>{page--;draw()};dialog.querySelector('[data-next]').onclick=()=>{page++;draw()};
  dialog.addEventListener('close',()=>{dialog.remove();trigger?.focus()},{once:true});root.append(dialog);draw();dialog.showModal();
 };
 root.querySelectorAll('[data-type]').forEach(b=>{b.onclick=()=>open(Number(b.dataset.type),b);if(b.tagName.toLowerCase()==='g')b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(Number(b.dataset.type),b)}}});
}
