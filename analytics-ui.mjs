import {analyticsCuts} from './voice-dashboard.mjs';
import {formatTopicLabel} from './listening-analytics.mjs';
import {renderVoiceDashboard} from './voice-dashboard-ui.mjs';
import {renderGeography} from './geography-ui.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=['#2469a6','#a7486c','#24838c','#a16e17','#705ba3'];
const empty='<p class="an-empty">No captured evidence for this selection.</p>';
export function renderAnalytics(root,people,statements,{period='all',view='overview',onStateChange,onNavigate,onOpenEvidence,onOpenDoctor,detail=null,monthPage=0,geographySelection=null}={}){
  if(view==='geography'){renderGeography(root,people,{onOpenDoctor,selection:geographySelection});return;}
  if(detail){renderVoiceDashboard(root,people,statements,{title:'Analytics',period,detail,onOpenEvidence,onOpenDoctor,navigate:()=>onNavigate('overview')});return;}
  const d=analyticsCuts(people,statements,{period});
  const action=(kind,value)=>`data-an-kind="${esc(kind)}" data-an-value="${esc(value)}"`;
  const bars=(items,kind)=>items.length?`<div class="an-bars">${items.map(({label,count})=>`<button ${action(kind,label)}><span>${esc(formatTopicLabel(label))}</span><span class="an-track"><i style="width:${100*count/Math.max(1,...items.map(x=>x.count))}%"></i></span><b>${count}</b></button>`).join('')}</div>`:empty;
  const ring=(items,kind,hole=true)=>{
    const palette=kind==='sentiment'?['#2469a6','#8999a8','#a7486c','#ccd5dc']:['#2469a6','#a7486c','#24838c','#a16e17','#705ba3'];
    const total=items.reduce((n,x)=>n+x.count,0);if(!total)return empty;
    let offset=0;
    const sectors=items.filter(x=>x.count).map((x,i)=>{
      const share=x.count/total,angle=offset*2*Math.PI-Math.PI/2;offset+=share;
      const end=offset*2*Math.PI-Math.PI/2;
      const path=share===1?'<circle cx="120" cy="120" r="96"/>':`<path d="M120,120 L${120+96*Math.cos(angle)},${120+96*Math.sin(angle)} A96,96 0 ${share>.5?1:0},1 ${120+96*Math.cos(end)},${120+96*Math.sin(end)} Z"/>`;
      return `<g fill="${palette[i%palette.length]}">${path}<title>${esc(x.label)}: ${x.count} statements (${Math.round(share*100)}%)</title></g>`;
    }).join('');
    return `<div class="an-ring"><svg viewBox="0 0 240 240" role="img" aria-label="${hole?'Donut':'Pie'} chart: ${esc(items.map(x=>`${x.label}, ${x.count}`).join('; '))}">${sectors}${hole?`<circle cx="120" cy="120" r="63" fill="#fff"/><text x="120" y="118" text-anchor="middle" class="an-ring-total">${total}</text><text x="120" y="141" text-anchor="middle" class="an-ring-label">Statements</text>`:''}</svg><div class="an-legend">${items.filter(x=>x.count).map((x,i)=>`<button ${action(kind,x.label)}><i style="background:${palette[i%palette.length]}"></i><span>${esc(x.label)}</span><b>${x.count}</b><small>${Math.round(x.count/total*100)}%</small></button>`).join('')}</div></div>`;
  };
  const radar=()=>{
    const axes=d.themes.slice(0,6).map(x=>x[0]);if(axes.length<3)return empty;
    const point=(i,r)=>[240+Math.cos(i*2*Math.PI/axes.length-Math.PI/2)*r,175+Math.sin(i*2*Math.PI/axes.length-Math.PI/2)*r];
    const polygon=r=>axes.map((_,i)=>point(i,r).join(',')).join(' ');
    return `<div class="an-radar"><svg viewBox="0 0 480 350" role="img" aria-label="Spiderweb comparison of theme shares within each archetype. Scale zero to 100 percent.">${[.25,.5,.75,1].map(n=>`<polygon points="${polygon(n*112)}" fill="none" stroke="#d3dfe6"/><text x="246" y="${175-n*112+12}" class="an-axis">${n*100}%</text>`).join('')}${axes.map((a,i)=>{const [x,y]=point(i,144),[tx,ty]=point(i,112);return `<line x1="240" y1="175" x2="${tx}" y2="${ty}" stroke="#d3dfe6"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="an-radar-label">${esc(({'Appropriate use & misuse':'Appropriate Use','Impact & disease framing':'Disease Framing','Safety & tolerability':'Safety','Availability & access':'Access'})[a]||formatTopicLabel(a))}</text>`}).join('')}${d.archetypes.map((g,i)=>`<polygon data-an-series="${i}" points="${axes.map((a,j)=>point(j,112*g.rows.filter(r=>r.themes?.includes(a)).length/g.count).join(',')).join(' ')}" fill="${palette[i%5]}" fill-opacity=".07" stroke="${palette[i%5]}" stroke-width="2.5"><title>${esc(g.label)}: ${g.count} statements</title></polygon>`).join('')}</svg><div class="an-radar-key">${d.archetypes.map((g,i)=>`<label><input type="checkbox" data-an-toggle="${i}" checked><i style="background:${palette[i%5]}"></i>${esc(g.label)} <b>n=${g.count}</b></label>`).join('')}</div></div>`;
  };
  const top=d.themes[0];
  const monthPages=Math.max(1,Math.ceil(d.months.length/6));monthPage=Math.min(monthPage,monthPages-1);
  const monthEnd=d.months.length-monthPage*6,monthSlice=d.months.slice(Math.max(0,monthEnd-6),monthEnd);
  root.innerHTML=`<header class="an-heading"><div><span class="voices-eyebrow">Conversation Intelligence</span><h2>Analytics</h2></div><label>Period<select id="anPeriod"><option value="all" ${period==='all'?'selected':''}>All Captured Dates</option><option value="12" ${period==='12'?'selected':''}>Last 12 Months</option></select></label></header>
  <nav class="an-tabs" aria-label="Analytics Views">${[['overview','Conversation'],['voices','Voices & Influence'],['channels','Channels & Timing'],['geography','Geography']].map(([id,label])=>`<button data-an-view="${id}" aria-current="${view===id?'page':'false'}">${label}</button>`).join('')}</nav>
  <div class="an-metrics">${[['Profiles',d.members.length],['Doctors in Conversation',d.doctors],['Attributed Statements',d.rows.length],['Source Articles',d.sources]].map(([l,n])=>`<div><strong>${n.toLocaleString('en-IN')}</strong><span>${l}</span></div>`).join('')}</div>
  ${view==='overview'?`<p class="an-readout">${top?`<strong>${esc(formatTopicLabel(top[0]))}</strong> appears in ${top[1]} of ${d.rows.length} captured statements.`:'No attributed statements in this period.'}</p><div class="an-grid"><section><header><span>01 / Themes</span><h3>What Is Driving the Conversation?</h3></header>${bars(d.themes.slice(0,6).map(([label,count])=>({label,count})),'themes')}<p>Statements by theme. A statement can cover more than one theme.</p></section><section><header><span>02 / Perspective</span><h3>How Are Doctors Responding?</h3></header>${ring(Object.entries(d.sentiments).map(([label,count])=>({label,count})),'sentiment')}<p>Coded tone, not endorsement or clinical evidence strength.</p></section></div>`:''}
  ${view==='voices'?`<div class="an-grid"><section><header><span>03 / Archetypes</span><h3>Where Do Perspectives Differ?</h3></header>${radar()}<p>Share of each archetype's statements covering each theme. Small samples are descriptive, not representative.</p></section><section><header><span>04 / Specialty</span><h3>Which Specialties Are Speaking?</h3></header>${bars(d.specialties,'specialty')}<p>Attributed statements, not all doctors in each specialty.</p><h4>Statements by Archetype</h4>${bars(d.archetypes,'archetype')}</section></div>`:''}
  ${view==='channels'?`<div class="an-grid"><section><header><span>05 / Channels</span><h3>Where Are Voices Being Heard?</h3></header>${ring(d.channels,'channel',false)}<p>Share of captured statements. Media coverage is separate from native social posts.</p></section><section><header><span>06 / Time</span><h3>When Was Commentary Published?</h3></header>${bars(monthSlice,'month')}<div class="persona-pager"><button data-an-older ${monthPage===monthPages-1?'disabled':''} title="Earlier months" aria-label="Earlier months">&#8592;</button><span>${monthSlice[0]?.label||''} to ${monthSlice.at(-1)?.label||''}</span><button data-an-newer ${monthPage===0?'disabled':''} title="Later months" aria-label="Later months">&#8594;</button></div><p>${d.undated} undated statements excluded. Months with captured commentary only; not total posting volume.</p></section></div>`:''}
  <footer class="an-footnote">Source-linked observations only. Like, comment, repost and reach totals are not available for a reliable comparison.</footer>`;
  root.querySelectorAll('[data-an-view]').forEach(b=>b.onclick=()=>onNavigate(b.dataset.anView));
  root.querySelector('#anPeriod').onchange=e=>{onStateChange?.({period:e.target.value});renderAnalytics(root,people,statements,{period:e.target.value,view,onStateChange,onNavigate,onOpenEvidence,onOpenDoctor})};
  root.querySelectorAll('[data-an-kind]').forEach(b=>b.onclick=()=>onOpenEvidence({kind:b.dataset.anKind,value:b.dataset.anValue}));
  root.querySelectorAll('[data-an-toggle]').forEach(input=>input.onchange=()=>root.querySelector(`[data-an-series="${input.dataset.anToggle}"]`).style.display=input.checked?'':'none');
  const turnMonths=delta=>renderAnalytics(root,people,statements,{period,view,onStateChange,onNavigate,onOpenEvidence,onOpenDoctor,monthPage:monthPage+delta});
  root.querySelector('[data-an-older]')?.addEventListener('click',()=>turnMonths(1));
  root.querySelector('[data-an-newer]')?.addEventListener('click',()=>turnMonths(-1));
}
