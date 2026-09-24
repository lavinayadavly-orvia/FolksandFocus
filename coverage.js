function renderCoverage(){
  const people=app.research;
  const countBy=key=>Object.entries(people.reduce((acc,item)=>{const value=item[key]||"Unclassified";acc[value]=(acc[value]||0)+1;return acc},{})).sort((a,b)=>b[1]-a[1]);
  const sources=people.reduce((sum,item)=>sum+item.footprints.length,0);
  const cities=countBy("city"),tiers=countBy("tier"),specialties=countBy("specialty");
  $("#coverageMetrics").innerHTML=[["Mapped people",people.length,"Identity-resolved public dossiers"],["Verified identities",people.filter(item=>item.matchConfidence>=95).length,"Institution and independent source"],["Cities represented",cities.length,"Current mapped geography"],["Source records",sources,"Institutional, scientific and public"]].map(item=>`<div class="coverage-metric"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join("");
  const bars=(items,max)=>items.map(([name,value])=>`<div class="distribution-row"><span>${esc(name)}</span><div class="distribution-track"><i style="width:${value/max*100}%"></i></div><strong>${value}</strong></div>`).join("");
  $("#cityDistribution").innerHTML=bars(cities,cities[0]?.[1]||1);
  $("#specialtyDistribution").innerHTML=bars(specialties,specialties[0]?.[1]||1);
  $("#tierDistribution").innerHTML=["National KOL","Scientific Leader","Rising Voice"].map(tier=>{const value=tiers.find(item=>item[0]===tier)?.[1]||0;return`<div class="tier-card"><i></i><span>${tier}</span><strong>${value}</strong></div>`}).join("");
  renderCoverageDirectory();
}

function renderCoverageDirectory(){
  const query=$("#coverageSearch")?.value.toLowerCase()||"";
  const people=app.research.filter(item=>!query||`${item.name} ${item.city} ${item.affiliation} ${item.tier} ${item.specialty}`.toLowerCase().includes(query));
  $("#coverageDirectory").innerHTML=people.map(person=>`<details class="coverage-person"><summary><div><strong>${esc(person.name)}</strong><small>${esc(person.specialty)}</small></div><span>${esc(person.affiliation)}</span><span class="coverage-tier-pill">${esc(person.tier)}</span><span>${esc(person.city)}</span></summary><div class="coverage-detail"><div><h4>Identity and affiliation</h4><p>${person.matchConfidence}% identity match · ${esc(person.affiliation)} · ${esc(person.city)}</p></div><div><h4>Known name variants</h4><p>${person.aliases.map(esc).join(" · ")}</p></div><div><h4>Evidence footprint</h4><div class="coverage-sources">${[...new Set(person.footprints.map(item=>item.type))].map(type=>`<span>${type}</span>`).join("")}</div></div></div></details>`).join("")||'<div class="empty">No mapped people match this filter.</div>';
}

$("#coverageSearch").addEventListener("input",renderCoverageDirectory);
