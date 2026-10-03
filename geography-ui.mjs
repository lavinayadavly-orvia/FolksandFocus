import {geographyPresence} from './geography.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const href=(state='',city='')=>'#analytics/geography'+(state?'/'+encodeURIComponent(state)+(city?'/'+encodeURIComponent(city):''):'');
const tabs='<nav class="an-tabs" aria-label="Analytics Views"><a href="#analytics/geography" aria-current="page">Geography</a><a href="#analytics">Conversation</a><a href="#analytics/voices">Voices &amp; Influence</a><a href="#analytics/research">Research &amp; Publications</a><a href="#analytics/channels">Channels &amp; Timing</a></nav>';
export function renderGeography(root,people,{onOpenDoctor,selection=null,page=0}={}){
 const d=geographyPresence(people);
 const all=selection?.state==='All Locations';
 const state=all?null:d.states.find(s=>s.label===selection?.state);
 const city=state?.cities.find(c=>c.label===selection?.city);
 const directory=state&&selection?.city;
 if(directory){
  const members=city?.people||(selection.city==='All Doctors'?state.people:[]);
  const pages=Math.max(1,Math.ceil(members.length/8));page=Math.max(0,Math.min(page,pages-1));
  root.innerHTML=`<a class="quiet-button" href="${href(state.label)}">&#8592; ${esc(state.label)}</a><header class="an-heading"><div><span class="voices-eyebrow">Geography / ${esc(state.label)}</span><h2>${esc(city?.label||state.label)}</h2></div><strong>N = ${members.length}</strong></header><div class="geo-table"><table><thead><tr><th>Doctor</th><th>Practice Location</th><th>Institution &amp; Source</th></tr></thead><tbody>${members.slice(page*8,page*8+8).map(p=>{
   const url=p.geographyEvidence?.sourceUrl||p.footprints?.find(f=>f.type==='INSTITUTION')?.url;
   return `<tr><td><button data-doctor="${esc(p.id)}">${esc(p.name)}</button></td><td>${esc(p.practiceLocations?.join(', ')||city?.label||p.city)}</td><td>${(url?.startsWith("https://")||url?.startsWith("http://"))?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.affiliation)} &#8599;</a>`:esc(p.affiliation)}</td></tr>`;
  }).join('')}</tbody></table></div><div class="persona-pager"><button data-prev ${page===0?'disabled':''} aria-label="Previous Page">&#8592;</button><span>${page+1} / ${pages}</span><button data-next ${page===pages-1?'disabled':''} aria-label="Next Page">&#8594;</button></div>`;
  root.querySelectorAll('[data-doctor]').forEach(b=>b.onclick=()=>onOpenDoctor(b.dataset.doctor));
  for(const [key,delta] of [['prev',-1],['next',1]])root.querySelector('[data-'+key+']').onclick=()=>renderGeography(root,people,{onOpenDoctor,selection,page:page+delta});
  return;
 }
 const ranked=state?state.cities:d.states,denominator=state?state.count:d.total;
 const pages=Math.max(1,Math.ceil(ranked.length/10));page=Math.max(0,Math.min(page,pages-1));
 const shown=ranked.slice(all?page*10:0,all?page*10+10:10),max=ranked[0]?.count||1;
 root.innerHTML=`${selection?`<a class="quiet-button" href="${href()}">&#8592; Geography</a>`:''}<header class="an-heading"><div><span class="voices-eyebrow">Analytics / Geography</span><h2>${esc(state?.label||(all?'All Locations':'Where Are Our Clinical Voices?'))}</h2></div><strong>N = ${denominator}</strong></header>${tabs}<section class="geo-chart geo-ranking"><header><h3>${state?'Doctors by City':'Doctors by State'}</h3>${state?`<a href="${href(state.label,'All Doctors')}">View Doctors &#8594;</a>`:!all&&ranked.length>10?`<a href="${href('All Locations')}">All ${ranked.length} Locations &#8594;</a>`:''}</header><div class="geo-rank-head"><span>Location</span><span>Doctors</span><span>% of N</span></div><div class="geo-ranked-bars">${shown.map(s=>`<a class="geo-ranked-row" href="${state?href(state.label,s.label):href(s.label)}" aria-label="${esc(s.label)}: ${s.count} doctors, ${(s.count/denominator*100).toFixed(1)} percent"><span class="geo-rank-name">${esc(s.label)}</span><span class="geo-bar-track"><span class="geo-bar-fill" style="width:${s.count/max*100}%"></span><strong>${s.count}</strong></span><span class="geo-rank-share">${(s.count/denominator*100).toFixed(1)}%</span></a>`).join('')||'<p>No Locations Available.</p>'}</div></section>${all?`<div class="persona-pager"><button data-prev ${page===0?'disabled':''} aria-label="Previous Page">&#8592;</button><span>${page+1} / ${pages}</span><button data-next ${page===pages-1?'disabled':''} aria-label="Next Page">&#8594;</button></div>`:''}<footer class="an-footnote">Doctors practising in each location · Locations may overlap.</footer>`;
 if(all)for(const [key,delta] of [['prev',-1],['next',1]])root.querySelector('[data-'+key+']').onclick=()=>renderGeography(root,people,{onOpenDoctor,selection,page:page+delta});
}
