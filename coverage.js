function renderCoverage(){
  const people=app.research;
  const countBy=key=>Object.entries(people.reduce((acc,item)=>{const value=item[key]||"Unclassified";acc[value]=(acc[value]||0)+1;return acc},{})).sort((a,b)=>b[1]-a[1]);
  const categoryFor=person=>({"Diabetology":"Diabetologist","Endocrinology":"Endocrinologist","Consulting physician":"Consulting Physician","General practitioner":"General Physician"}[coverageSpecialty(person)]||coverageSpecialty(person));
  const sources=people.reduce((sum,item)=>sum+item.footprints.length,0);
  const regions=countBy("region"),cities=countBy("city"),tiers=countBy("tier"),specialties=countBy("specialty");
  const categories=[
    {name:"Diabetes care",universe:"12,000+",mapped:people.filter(person=>person.specialties?person.specialties.includes("Diabetology"):categoryFor(person)==="Diabetologist").length,source:"RSSDI membership",url:"https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2074561&lang=2&reg=48"},
    {name:"Endocrinologists",universe:"2,000+",mapped:people.filter(person=>person.specialties?person.specialties.includes("Endocrinology"):categoryFor(person)==="Endocrinologist").length,source:"ESI membership",url:"https://pmc.ncbi.nlm.nih.gov/articles/PMC10870988/"},
    {name:"Consulting physicians",universe:"22,000",mapped:people.filter(person=>person.specialties?person.specialties.includes("General Medicine"):categoryFor(person)==="Consulting Physician").length,source:"API membership",url:"https://www.apiindia.org/about/api"},
    {name:"General practitioners",universe:"50,000+",mapped:people.filter(person=>person.specialties?person.specialties.includes("General Practice"):categoryFor(person)==="General Physician").length,source:"IMA documented members",url:"https://www.ima-india.org/ima/pdfdata/01-March-2021-IMA-News.pdf"}
  ];
  const opinionLeaders=people.filter(person=>["National KOL","Regional KOL"].includes(person.tier));
  const socialProfiles=people.filter(person=>person.footprints.some(item=>item.type==="SOCIAL"));
  const socialRecords=people.flatMap(person=>person.footprints).filter(item=>item.type==="SOCIAL");
  const allFootprints=people.flatMap(person=>person.footprints);
  const cohort=app.candidates?.profiles||[];
  const dolClasses=[
    {name:"Trendsetters",count:0,detail:"Requires verified experience"},
    {name:"Rising Stars",count:0,detail:"Requires verified experience"},
    {name:"Early Sparks",count:0,detail:"Requires verified experience"}
  ];
  const verifiedDiscovery=app.discovery?.profiles.filter(item=>item.status==="VERIFIED")||[];
  const discoveredWorks=verifiedDiscovery.reduce((sum,item)=>sum+(item.recentWorks?.length||0),0);
  const discoveredCitations=verifiedDiscovery.reduce((sum,item)=>sum+(item.citedByCount||0),0);
  $("#coverageMetrics").innerHTML=[["Discovered candidates",app.candidates?.profiles.length||0,"India-affiliated literature identities"],["Source-backed profiles",people.length,"Registry verification remains separate"],["Mapped opinion leaders",opinionLeaders.length,"National and regional KOL tiers"],["Digital records",sources,"Linked and reviewable sources"]].map(item=>`<div class="coverage-metric"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join("");
  const bars=(items,max)=>items.map(([name,value])=>`<div class="distribution-row"><span>${esc(name)}</span><div class="distribution-track"><i style="width:${value/max*100}%"></i></div><strong>${value}</strong></div>`).join("");
  $("#roleDistribution").innerHTML=categories.map(item=>`<article class="role-stat"><span>${esc(item.name)}</span><strong>${esc(item.universe)}</strong><small>National benchmark · ${esc(item.source)}</small><div><b>${item.mapped}</b> mapped profiles (specialties may overlap) <a href="${esc(item.url)}" target="_blank" rel="noopener">Source ↗</a></div></article>`).join("");
  $("#socialActivityStats").innerHTML=[["Socially resolved profiles",socialProfiles.length],["X profiles",allFootprints.filter(item=>item.publisher==="X").length],["YouTube profiles",people.filter(person=>person.footprints.some(item=>item.type==="VIDEO")).length],["Instagram profiles",0],["Verified recent works",discoveredWorks],["Verified author citations",discoveredCitations.toLocaleString("en-IN")],["News records",allFootprints.filter(item=>item.type==="NEWS").length],["Promotional records",allFootprints.filter(item=>item.type==="PROMOTION").length]].map(([label,value])=>`<div class="social-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("#dolClassifications").innerHTML=dolClasses.map((item,index)=>`<article class="dol-class dol-${index+1}"><span>${item.name}</span><strong>${item.count}</strong><p>${item.detail}</p></article>`).join("");
  $("#regionDistribution").innerHTML=bars(regions,regions[0]?.[1]||1);
  $("#cityDistribution").innerHTML=bars(cities.slice(0,8),cities[0]?.[1]||1);
  $("#specialtyDistribution").innerHTML=bars(specialties.slice(0,8),specialties[0]?.[1]||1);
  $("#tierDistribution").innerHTML=["National KOL","Regional KOL","Scientific Leader","Rising Voice"].map(tier=>{const value=tiers.find(item=>item[0]===tier)?.[1]||0;return`<div class="tier-card"><i></i><span>${tier}</span><strong>${value}</strong></div>`}).join("");
  const candidates=cohort;
  $("#candidateCount").textContent=`${candidates.length} candidates · Showing first 8; search all in Profiles`;
  $("#candidateDirectory").innerHTML=candidates.slice(0,8).map(item=>`<details class="candidate-person"><summary><strong>${esc(item.name)}</strong><span>${esc(item.institutions.join(" · ")||"Institution unresolved")}</span><i class="dol-badge">Identity review</i><b>${item.sampleWorks.length} source works</b></summary><div><p>${esc(item.topics.join(" · "))}</p>${item.sampleWorks.map(work=>`<a href="${esc(work.url)}" target="_blank" rel="noopener">${esc(work.title)} <small>${esc(work.date||"")}</small></a>`).join("")}</div></details>`).join("");
  renderCoverageDirectory();
  renderCoverageWorkbench();
}

function renderCoverageDirectory(){
  const query=$("#coverageSearch")?.value.toLowerCase()||"";
  const categoryFor=person=>({"Diabetology":"Diabetologist","Endocrinology":"Endocrinologist","Consulting physician":"Consulting Physician","General practitioner":"General Physician"}[coverageSpecialty(person)]||coverageSpecialty(person));
  const people=app.research.filter(item=>!query||`${item.name} ${item.city} ${item.state} ${item.region} ${item.affiliation} ${item.tier} ${item.specialty} ${categoryFor(item)}`.toLowerCase().includes(query));
  $("#coverageDirectory").innerHTML=people.slice(0,8).map(person=>`<details class="coverage-person"><summary><div><strong>${esc(person.name)}</strong><small>${esc(person.specialty)}</small></div><span>${esc(person.affiliation)}</span><span class="coverage-tier-pill">${esc(person.tier)}</span><span>${esc(person.city)} · ${esc(person.region)}</span></summary><div class="coverage-detail"><div><h4>Identity and affiliation</h4><p>${person.matchConfidence==null?"Identity match not assessed":`${person.matchConfidence}% identity match`} · ${esc(person.affiliation)} · ${esc(person.city)}, ${esc(person.state)}</p></div><div><h4>Known name variants</h4><p>${person.aliases.map(esc).join(" · ")}</p></div><div><h4>Evidence footprint</h4><div class="coverage-sources">${[...new Set(person.footprints.map(item=>item.type))].map(type=>`<span>${type}</span>`).join("")}</div></div></div></details>`).join("")||'<div class="empty">No mapped people match this filter.</div>';
}

$("#coverageSearch").addEventListener("input",renderCoverageDirectory);

const coverageScope={query:"",region:"",specialty:"",city:"",selected:"",page:0};
function coverageSpecialty(person){
  if(person.specialties?.length){const s=person.specialties[0];return s==="General Medicine"?"Consulting physician":s==="General Practice"?"General practitioner":s;}
  if(["kol-v-mohan","kol-banshi-saboo"].includes(person.id))return "Diabetology";
  if(/internal medicine/i.test(person.specialty))return "Consulting physician";
  if(/general practice/i.test(person.specialty))return "General practitioner";
  if(/endocrinolog/i.test(person.specialty))return "Endocrinology";
  return "Unclassified";
}
function coverageSpecialtyLabels(people){
  const base=["Endocrinology","Diabetology","Consulting physician","General practitioner","Cardiology","Obstetrics and Gynaecology","Unclassified"];
  return [...base,...[...new Set(people.map(coverageSpecialty))].filter(s=>!base.includes(s)).sort()];
}
function renderCoverageWorkbench(){
  const root=$("#coverageWorkbench");
  if(!root.dataset.ready){
    root.innerHTML=`<div class="coverage-controls"><label class="coverage-query">Find a doctor<input id="scopeQuery" type="search" placeholder="Name, institution or city"></label><label>Specialty<select id="scopeSpecialty"><option value="">All specialties</option>${coverageSpecialtyLabels(app.research).map(x=>`<option>${esc(x)}</option>`).join("")}</select></label><label>Region<select id="scopeRegion"><option value="">Pan India</option>${["North","South","East","West","Central","Not verified"].map(x=>`<option>${x}</option>`).join("")}</select></label><button id="scopeReset" class="quiet-button">Reset filters</button></div><div class="scope-caption" id="scopeCaption"></div><div class="coverage-analysis"><section class="geography-analysis"><div class="analysis-heading"><h2>Geographic reach</h2><span>Verified city coverage</span></div><div id="scopeCities"></div></section><section class="channel-analysis"><div class="analysis-heading"><h2>Evidence coverage</h2><span>Linked source records</span></div><div id="scopeSources"></div></section></div><div class="coverage-explorer"><section class="doctor-results"><div class="analysis-heading"><h2>Doctors in focus</h2><span id="scopeCount"></span></div><div class="table-scroll"><table class="doctor-table"><thead><tr><th>Doctor / institution</th><th>City</th><th>Analyst tier</th><th>Sources</th></tr></thead><tbody id="scopeDoctors"></tbody></table></div></section><aside id="scopeProfile" class="doctor-evidence" aria-label="Selected doctor evidence"></aside></div>`;
    $("#scopeCaption").insertAdjacentHTML("afterend",'<section class="mekko-section" aria-labelledby="mekkoTitle"><div class="analysis-heading"><div><p class="chart-eyebrow">GEOGRAPHIC COVERAGE</p><h2 id="mekkoTitle">Where the mapped expertise sits</h2></div><span id="mekkoTotal"></span></div><div id="mekkoLegend" class="mekko-legend"></div><div class="mekko-scroll"><div id="geographyMekko" class="mekko-chart" aria-label="Marimekko chart of mapped doctors by region and specialty"></div></div><p class="chart-caption">Column width = region share of mapped doctors. Segment height = specialty share within that region. Area = number of doctors. This is mapped coverage, not national workforce coverage.</p></section>');
    root.dataset.ready="true";
    $("#scopeQuery").oninput=event=>{coverageScope.page=0;coverageScope.query=event.target.value;renderCoverageWorkbench()};
    $("#scopeSpecialty").onchange=event=>{coverageScope.page=0;coverageScope.specialty=event.target.value;coverageScope.city="";renderCoverageWorkbench()};
    $("#scopeRegion").onchange=event=>{coverageScope.page=0;coverageScope.region=event.target.value;coverageScope.city="";renderCoverageWorkbench()};
    $("#scopeReset").onclick=()=>{Object.assign(coverageScope,{query:"",region:"",specialty:"",city:""});$("#scopeQuery").value="";$("#scopeRegion").value="";$("#scopeSpecialty").value="";renderCoverageWorkbench()};
  }
  const base=app.research.filter(p=>(!coverageScope.region||p.region===coverageScope.region)&&(!coverageScope.specialty||coverageSpecialty(p)===coverageScope.specialty)&&(!coverageScope.query||`${p.name} ${p.affiliation} ${p.city} ${p.specialty}`.toLowerCase().includes(coverageScope.query.toLowerCase())));
  const people=base.filter(p=>!coverageScope.city||p.city===coverageScope.city);
  if(!people.some(p=>p.id===coverageScope.selected))coverageScope.selected=people[0]?.id||"";
  const records=people.flatMap(p=>p.footprints);
  renderGeographyMekko(people);
  const cities=Object.entries(base.filter(p=>p.city!=="Not verified").reduce((a,p)=>{a[p.city]=(a[p.city]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  $("#scopeCaption").textContent=`${people.length} source-backed profiles · ${coverageScope.region||"Pan India"}${coverageScope.city?` / ${coverageScope.city}`:""} · ${records.length} linked records`;
  $("#scopeCount").textContent=`${people.length} of ${app.research.length} profiles`;
  $("#scopeCities").innerHTML=cities.slice(0,8).map(([city,count])=>`<button class="city-bar ${coverageScope.city===city?"selected":""}" data-scope-city="${esc(city)}" aria-pressed="${coverageScope.city===city}"><span>${esc(city)}</span><span class="city-track"><i style="width:${count/(cities[0]?.[1]||1)*100}%"></i></span><b>${count}</b></button>`).join("")||'<p class="scope-empty">No cities match these filters.</p>';
  const sourceTypes=[["PUBLICATION","Publications"],["CONFERENCE","Conferences"],["NEWS","News"],["SOCIAL","Social profiles"],["VIDEO","Video"],["INSTITUTION","Institutions"],["PROMOTION","Promotions"]];
  $("#scopeSources").innerHTML=sourceTypes.map(([type,label])=>{const count=records.filter(r=>r.type===type).length;return `<div class="source-measure"><span>${label}</span><b>${count}</b><span class="source-track"><i style="width:${records.length?count/records.length*100:0}%"></i></span></div>`}).join("");
  coverageScope.page=Math.max(0,Math.min(coverageScope.page,Math.ceil(people.length/8)-1));
  $("#scopeCount").innerHTML=`${people.length} profiles · Page ${coverageScope.page+1} / ${Math.max(1,Math.ceil(people.length/8))} <button data-scope-page="-1" ${coverageScope.page===0?"disabled":""} aria-label="Previous doctors">←</button><button data-scope-page="1" ${(coverageScope.page+1)*8>=people.length?"disabled":""} aria-label="Next doctors">→</button>`;
  root.querySelectorAll("[data-scope-page]").forEach(b=>b.onclick=()=>{coverageScope.page+=Number(b.dataset.scopePage);renderCoverageWorkbench()});
  $("#scopeDoctors").innerHTML=people.slice(coverageScope.page*8,coverageScope.page*8+8).map(p=>`<tr class="${p.id===coverageScope.selected?"selected":""}"><td><button class="doctor-select" data-scope-doctor="${esc(p.id)}" aria-pressed="${p.id===coverageScope.selected}">${esc(p.name)}</button><small>${esc(p.affiliation)}</small></td><td>${esc(p.city)}</td><td>${esc(p.tier)}</td><td>${p.footprints.length}</td></tr>`).join("")||'<tr><td colspan="4" class="scope-empty">No verified doctors match. Reset the filters to view all profiles.</td></tr>';
  root.querySelectorAll("[data-scope-city]").forEach(button=>button.onclick=()=>{coverageScope.city=coverageScope.city===button.dataset.scopeCity?"":button.dataset.scopeCity;renderCoverageWorkbench()});
  root.querySelectorAll("[data-scope-doctor]").forEach(button=>button.onclick=()=>{coverageScope.selected=button.dataset.scopeDoctor;renderCoverageWorkbench()});
  const person=people.find(p=>p.id===coverageScope.selected);
  $("#scopeProfile").innerHTML=person?`<p class="profile-eyebrow">EXPERT PROFILE</p><h2>${esc(person.name)}</h2><p>${esc(person.specialty)}</p><p class="profile-location">${esc(person.city)} · ${esc(person.state)}</p><dl class="profile-facts"><div><dt>Institution</dt><dd>${esc(person.affiliation)}</dd></div><div><dt>Analyst tier</dt><dd>${esc(person.tier)}</dd></div><div><dt>Identity match</dt><dd>${person.matchConfidence==null?"Not assessed":`${person.matchConfidence}%`}</dd></div></dl><a href="#voices/profile/${encodeURIComponent(person.id)}">Open Full Profile →</a><h3>Supporting evidence <span>${person.footprints.length}</span></h3><div class="profile-evidence-list">${person.footprints.slice(0,4).map(r=>`<a href="${esc(r.url)}" target="_blank" rel="noopener"><small>${esc(r.type.toLowerCase())} · ${esc(r.publisher)}</small><strong>${esc(r.title)}</strong><span>${esc(r.date||"Date unavailable")} · ${r.confidence==="REVIEW"?"Needs confirmation":r.confidence==="SOURCE_CONFIRMED"?"Source confirmed":"Identity matched"}</span></a>`).join("")}</div>`:'<p class="scope-empty">Select a doctor to review their profile and evidence.</p>';
}

function geographyMekkoData(people){
  const regions=[...new Set(["North","South","West","East","Central",...people.map(p=>p.region||"Unclassified")])];
  const specialties=coverageSpecialtyLabels(people);
  return regions.map(region=>{
    const group=people.filter(p=>(p.region||"Unclassified")===region);
    return {region,count:group.length,width:people.length?group.length/people.length:0,segments:specialties.map((specialty,index)=>{
      const count=group.filter(p=>coverageSpecialty(p)===specialty).length;
      return {specialty,index,count,height:group.length?count/group.length:0};
    }).filter(segment=>segment.count)};
  }).filter(column=>column.count);
}

function renderGeographyMekko(people){
  const unlocated=people.filter(p=>!p.region||p.region==="Not verified").length;
  people=people.filter(p=>p.region&&p.region!=="Not verified");
  const columns=geographyMekkoData(people);
  const labels=coverageSpecialtyLabels(people);
  $("#mekkoTotal").textContent=`${people.length} geographically mapped · ${unlocated} awaiting geography verification`;
  $("#mekkoLegend").innerHTML=labels.map((label,index)=>`<span><i class="mekko-color-${Math.min(index,6)}"></i>${esc(label)}<b>${people.filter(p=>coverageSpecialty(p)===label).length}</b></span>`).join("");
  $("#geographyMekko").innerHTML=columns.length?columns.map(column=>`<div class="mekko-column" style="width:${column.width*100}%"><div class="mekko-column-label"><strong>${esc(column.region)}</strong><span>${column.count} · ${Math.round(column.width*100)}%</span></div><div class="mekko-stack">${column.segments.map(segment=>`<button class="mekko-segment mekko-color-${Math.min(segment.index,6)}" style="height:${segment.height*100}%" data-mekko-region="${esc(column.region)}" data-mekko-specialty="${esc(segment.specialty)}" title="${esc(column.region)} · ${esc(segment.specialty)}: ${segment.count} of ${column.count} doctors (${Math.round(segment.height*100)}%)" aria-label="Filter ${esc(column.region)}, ${esc(segment.specialty)}: ${segment.count} doctors"><strong>${segment.count}</strong><span>${esc(["Endo","Diabeto","CP","GP","Cardio","OB/GYN","Unknown"][segment.index]||segment.specialty)}</span></button>`).join("")}</div></div>`).join(""):'<p class="scope-empty">No mapped doctors in this selection. Reset filters to restore the geographic view.</p>';
  $("#geographyMekko").querySelectorAll("[data-mekko-region]").forEach(button=>button.onclick=()=>{
    Object.assign(coverageScope,{region:button.dataset.mekkoRegion,specialty:button.dataset.mekkoSpecialty,city:""});
    $("#scopeRegion").value=coverageScope.region;$("#scopeSpecialty").value=coverageScope.specialty;
    renderCoverageWorkbench();
  });
}
