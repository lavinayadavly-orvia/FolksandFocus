import {sourceLibrary, congressWatches} from './source-library.mjs';

const host=document.createElement('section');
host.className='source-discovery';
host.innerHTML=`<div class="panel-head"><div><p class="kicker">Source discovery / 28 Sep 2026</p><h2>Professional voices & long-form sources</h2></div><label>Source <select id="discoveryPlatform"><option>All</option>${[...new Set(sourceLibrary.map(x=>x.platform))].map(x=>`<option>${x}</option>`).join('')}</select></label></div><p>Manually discovered records, separate from captured post totals. Dates and engagement remain unknown where not verified.</p><div id="discoveryRecords"></div><h3>Congress watchlist</h3><div id="congressWatches"></div>`;
document.querySelector('#social').append(host);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){
  const filter=host.querySelector('select').value;
  host.querySelector('#discoveryRecords').innerHTML=sourceLibrary.filter(x=>filter==='All'||x.platform===filter).map(x=>`<article class="discovery-row"><div><span class="platform-chip">${escape(x.platform)}</span><small>${escape(x.kind)} / ${escape(x.relationship)}</small></div><h3><a href="${escape(x.url)}" target="_blank" rel="noopener">${escape(x.title)} ↗</a></h3><strong>${escape(x.person)}</strong><p>${escape(x.summary)}</p><small>${escape(x.status)} · Published: ${x.publishedAt||'unconfirmed'} · Observed: ${x.observedOn}</small>${x.evidenceUrl?` <a href="${escape(x.evidenceUrl)}" target="_blank" rel="noopener">Identity source</a>`:''}</article>`).join('');
}
host.querySelector('select').addEventListener('change',render);
host.querySelector('#congressWatches').innerHTML=congressWatches.map(x=>`<div class="discovery-row"><strong>${escape(x.name)}</strong><p>${escape(x.status)}</p><a href="https://x.com/search?q=${encodeURIComponent(x.query)}&f=live" target="_blank" rel="noopener">Search X ↗</a> · <a href="${escape(x.evidenceUrl)}" target="_blank" rel="noopener">Supporting source ↗</a></div>`).join('');
render();
