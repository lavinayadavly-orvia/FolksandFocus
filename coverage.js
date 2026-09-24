function renderCoverage(){
  const people=app.research;
  const countBy=key=>Object.entries(people.reduce((acc,item)=>{const value=item[key]||"Unclassified";acc[value]=(acc[value]||0)+1;return acc},{})).sort((a,b)=>b[1]-a[1]);
  const categoryFor=person=>person.id==="kol-v-mohan"||person.id==="kol-banshi-saboo"?"Diabetologist":person.specialty.toLowerCase().includes("internal medicine")?"Consulting Physician":person.specialty.toLowerCase().includes("general practice")?"General Physician":"Endocrinologist";
  const sources=people.reduce((sum,item)=>sum+item.footprints.length,0);
  const regions=countBy("region"),cities=countBy("city"),tiers=countBy("tier"),specialties=countBy("specialty");
  const categories=[
    {name:"Diabetes care",universe:"12,000+",mapped:people.filter(person=>categoryFor(person)==="Diabetologist").length,source:"RSSDI membership",url:"https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2074561&lang=2&reg=48"},
    {name:"Endocrinologists",universe:"2,000+",mapped:people.filter(person=>categoryFor(person)==="Endocrinologist").length,source:"ESI membership",url:"https://pmc.ncbi.nlm.nih.gov/articles/PMC10870988/"},
    {name:"Consulting physicians",universe:"22,000",mapped:people.filter(person=>categoryFor(person)==="Consulting Physician").length,source:"API membership",url:"https://www.apiindia.org/about/api"},
    {name:"General practitioners",universe:"50,000+",mapped:people.filter(person=>categoryFor(person)==="General Physician").length,source:"IMA documented members",url:"https://www.ima-india.org/ima/pdfdata/01-March-2021-IMA-News.pdf"}
  ];
  const opinionLeaders=people.filter(person=>["National KOL","Regional KOL"].includes(person.tier));
  const socialProfiles=people.filter(person=>person.footprints.some(item=>item.type==="SOCIAL"));
  const socialRecords=people.flatMap(person=>person.footprints).filter(item=>item.type==="SOCIAL");
  $("#coverageMetrics").innerHTML=[["Mapped people",people.length,"Identity-resolved public dossiers"],["Mapped opinion leaders",opinionLeaders.length,"National and regional KOL tiers"],["Socially evidenced",socialProfiles.length,"Profiles with matched public activity"],["Social records",socialRecords.length,"Linked and reviewable sources"]].map(item=>`<div class="coverage-metric"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join("");
  const bars=(items,max)=>items.map(([name,value])=>`<div class="distribution-row"><span>${esc(name)}</span><div class="distribution-track"><i style="width:${value/max*100}%"></i></div><strong>${value}</strong></div>`).join("");
  $("#roleDistribution").innerHTML=categories.map(item=>`<article class="role-stat"><span>${esc(item.name)}</span><strong>${esc(item.universe)}</strong><small>National benchmark · ${esc(item.source)}</small><div><b>${item.mapped}</b> mapped dossiers <a href="${esc(item.url)}" target="_blank" rel="noopener">Source ↗</a></div></article>`).join("");
  $("#socialActivityStats").innerHTML=[["Profiles with social evidence",socialProfiles.length],["Verified social records",socialRecords.filter(item=>item.confidence==="VERIFIED").length],["Measured posts","Not connected"],["Engagement metrics","Not connected"]].map(([label,value])=>`<div class="social-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("#regionDistribution").innerHTML=bars(regions,regions[0]?.[1]||1);
  $("#cityDistribution").innerHTML=bars(cities,cities[0]?.[1]||1);
  $("#specialtyDistribution").innerHTML=bars(specialties,specialties[0]?.[1]||1);
  $("#tierDistribution").innerHTML=["National KOL","Regional KOL","Scientific Leader","Rising Voice"].map(tier=>{const value=tiers.find(item=>item[0]===tier)?.[1]||0;return`<div class="tier-card"><i></i><span>${tier}</span><strong>${value}</strong></div>`}).join("");
  renderCoverageDirectory();
}

function renderCoverageDirectory(){
  const query=$("#coverageSearch")?.value.toLowerCase()||"";
  const categoryFor=person=>person.id==="kol-v-mohan"||person.id==="kol-banshi-saboo"?"Diabetologist":person.specialty.toLowerCase().includes("internal medicine")?"Consulting Physician":person.specialty.toLowerCase().includes("general practice")?"General Physician":"Endocrinologist";
  const people=app.research.filter(item=>!query||`${item.name} ${item.city} ${item.state} ${item.region} ${item.affiliation} ${item.tier} ${item.specialty} ${categoryFor(item)}`.toLowerCase().includes(query));
  $("#coverageDirectory").innerHTML=people.map(person=>`<details class="coverage-person"><summary><div><strong>${esc(person.name)}</strong><small>${esc(person.specialty)}</small></div><span>${esc(person.affiliation)}</span><span class="coverage-tier-pill">${esc(person.tier)}</span><span>${esc(person.city)} · ${esc(person.region)}</span></summary><div class="coverage-detail"><div><h4>Identity and affiliation</h4><p>${person.matchConfidence}% identity match · ${esc(person.affiliation)} · ${esc(person.city)}, ${esc(person.state)}</p></div><div><h4>Known name variants</h4><p>${person.aliases.map(esc).join(" · ")}</p></div><div><h4>Evidence footprint</h4><div class="coverage-sources">${[...new Set(person.footprints.map(item=>item.type))].map(type=>`<span>${type}</span>`).join("")}</div></div></div></details>`).join("")||'<div class="empty">No mapped people match this filter.</div>';
}

$("#coverageSearch").addEventListener("input",renderCoverageDirectory);
