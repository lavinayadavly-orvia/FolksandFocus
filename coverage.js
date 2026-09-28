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
  const allFootprints=people.flatMap(person=>person.footprints);
  const cohort=app.candidates?.profiles||[];
  const dolClasses=[
    {name:"Trendsetters",count:opinionLeaders.length,detail:"Established KOLs with verified public dossiers"},
    {name:"Rising Stars",count:people.length-opinionLeaders.length+cohort.filter(item=>item.signalClass==="Rising Star").length,detail:"Upcoming KOLs with accelerating evidence signals"},
    {name:"Early Sparks",count:cohort.filter(item=>item.signalClass==="Early Spark").length,detail:"Newer names entering the monitored landscape"}
  ];
  const verifiedDiscovery=app.discovery?.profiles.filter(item=>item.status==="VERIFIED")||[];
  const discoveredWorks=verifiedDiscovery.reduce((sum,item)=>sum+(item.recentWorks?.length||0),0);
  const discoveredCitations=verifiedDiscovery.reduce((sum,item)=>sum+(item.citedByCount||0),0);
  $("#coverageMetrics").innerHTML=[["Discovered candidates",app.candidates?.profiles.length||0,"India-affiliated literature identities"],["Verified dossiers",people.length,"Identity-resolved public profiles"],["Mapped opinion leaders",opinionLeaders.length,"National and regional KOL tiers"],["Digital records",sources,"Linked and reviewable sources"]].map(item=>`<div class="coverage-metric"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></div>`).join("");
  const bars=(items,max)=>items.map(([name,value])=>`<div class="distribution-row"><span>${esc(name)}</span><div class="distribution-track"><i style="width:${value/max*100}%"></i></div><strong>${value}</strong></div>`).join("");
  $("#roleDistribution").innerHTML=categories.map(item=>`<article class="role-stat"><span>${esc(item.name)}</span><strong>${esc(item.universe)}</strong><small>National benchmark · ${esc(item.source)}</small><div><b>${item.mapped}</b> mapped dossiers <a href="${esc(item.url)}" target="_blank" rel="noopener">Source ↗</a></div></article>`).join("");
  $("#socialActivityStats").innerHTML=[["Socially resolved profiles",socialProfiles.length],["X profiles",allFootprints.filter(item=>item.publisher==="X").length],["YouTube profiles",people.filter(person=>person.footprints.some(item=>item.type==="VIDEO")).length],["Instagram profiles",0],["Verified recent works",discoveredWorks],["Verified author citations",discoveredCitations.toLocaleString("en-IN")],["News records",allFootprints.filter(item=>item.type==="NEWS").length],["Promotional records",allFootprints.filter(item=>item.type==="PROMOTION").length]].map(([label,value])=>`<div class="social-stat"><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("#dolClassifications").innerHTML=dolClasses.map((item,index)=>`<article class="dol-class dol-${index+1}"><span>${item.name}</span><strong>${item.count}</strong><p>${item.detail}</p></article>`).join("");
  $("#regionDistribution").innerHTML=bars(regions,regions[0]?.[1]||1);
  $("#cityDistribution").innerHTML=bars(cities,cities[0]?.[1]||1);
  $("#specialtyDistribution").innerHTML=bars(specialties,specialties[0]?.[1]||1);
  $("#tierDistribution").innerHTML=["National KOL","Regional KOL","Scientific Leader","Rising Voice"].map(tier=>{const value=tiers.find(item=>item[0]===tier)?.[1]||0;return`<div class="tier-card"><i></i><span>${tier}</span><strong>${value}</strong></div>`}).join("");
  const candidates=cohort;
  $("#candidateCount").textContent=`${candidates.length} candidates`;
  $("#candidateDirectory").innerHTML=candidates.map(item=>`<details class="candidate-person"><summary><strong>${esc(item.name)}</strong><span>${esc(item.institutions.join(" · ")||"Institution unresolved")}</span><i class="dol-badge">${esc(item.signalClass)}</i><b>${item.sampleWorks.length} source works</b></summary><div><p>${esc(item.topics.join(" · "))}</p>${item.sampleWorks.map(work=>`<a href="${esc(work.url)}" target="_blank" rel="noopener">${esc(work.title)} <small>${esc(work.date||"")}</small></a>`).join("")}</div></details>`).join("");
  renderCoverageDirectory();
  renderCoverageWorkbench();
}

function renderCoverageDirectory(){
  const query=$("#coverageSearch")?.value.toLowerCase()||"";
  const categoryFor=person=>person.id==="kol-v-mohan"||person.id==="kol-banshi-saboo"?"Diabetologist":person.specialty.toLowerCase().includes("internal medicine")?"Consulting Physician":person.specialty.toLowerCase().includes("general practice")?"General Physician":"Endocrinologist";
  const people=app.research.filter(item=>!query||`${item.name} ${item.city} ${item.state} ${item.region} ${item.affiliation} ${item.tier} ${item.specialty} ${categoryFor(item)}`.toLowerCase().includes(query));
  $("#coverageDirectory").innerHTML=people.map(person=>`<details class="coverage-person"><summary><div><strong>${esc(person.name)}</strong><small>${esc(person.specialty)}</small></div><span>${esc(person.affiliation)}</span><span class="coverage-tier-pill">${esc(person.tier)}</span><span>${esc(person.city)} · ${esc(person.region)}</span></summary><div class="coverage-detail"><div><h4>Identity and affiliation</h4><p>${person.matchConfidence}% identity match · ${esc(person.affiliation)} · ${esc(person.city)}, ${esc(person.state)}</p></div><div><h4>Known name variants</h4><p>${person.aliases.map(esc).join(" · ")}</p></div><div><h4>Evidence footprint</h4><div class="coverage-sources">${[...new Set(person.footprints.map(item=>item.type))].map(type=>`<span>${type}</span>`).join("")}</div></div></div></details>`).join("")||'<div class="empty">No mapped people match this filter.</div>';
}

$("#coverageSearch").addEventListener("input",renderCoverageDirectory);

const coverageScope={query:"",region:"",specialty:"",city:"",selected:""};
function coverageSpecialty(person){
  if(["kol-v-mohan","kol-banshi-saboo"].includes(person.id))return "Diabetology";
  if(/internal medicine/i.test(person.specialty))return "Consulting physician";
  if(/general practice/i.test(person.specialty))return "General practitioner";
  return "Endocrinology";
}
function renderCoverageWorkbench(){
  const root=$("#coverageWorkbench");
  if(!root.dataset.ready){
    root.innerHTML=`<div class="coverage-controls"><label class="coverage-query">Find a doctor<input id="scopeQuery" type="search" placeholder="Name, institution or city"></label><label>Specialty<select id="scopeSpecialty"><option value="">All specialties</option>${["Diabetology","Endocrinology","Consulting physician","General practitioner"].map(x=>`<option>${x}</option>`).join("")}</select></label><label>Region<select id="scopeRegion"><option value="">Pan India</option>${["North","South","East","West","Central"].map(x=>`<option>${x}</option>`).join("")}</select></label><button id="scopeReset" class="quiet-button">Reset filters</button></div><div class="scope-caption" id="scopeCaption"></div><div class="coverage-analysis"><section class="geography-analysis"><div class="analysis-heading"><h2>Geographic reach</h2><span>Verified doctors by city</span></div><div id="scopeCities"></div></section><section class="channel-analysis"><div class="analysis-heading"><h2>Evidence coverage</h2><span>Linked source records</span></div><div id="scopeSources"></div></section></div><div class="coverage-explorer"><section class="doctor-results"><div class="analysis-heading"><h2>Doctors in focus</h2><span id="scopeCount"></span></div><div class="table-scroll"><table class="doctor-table"><thead><tr><th>Doctor / institution</th><th>City</th><th>Analyst tier</th><th>Sources</th></tr></thead><tbody id="scopeDoctors"></tbody></table></div></section><aside id="scopeProfile" class="doctor-evidence" aria-label="Selected doctor evidence"></aside></div>`;
    $("#scopeCaption").insertAdjacentHTML("afterend",'<section class="mekko-section" aria-labelledby="mekkoTitle"><div class="analysis-heading"><div><p class="chart-eyebrow">GEOGRAPHIC COVERAGE</p><h2 id="mekkoTitle">Where the mapped expertise sits</h2></div><span id="mekkoTotal"></span></div><div id="mekkoLegend" class="mekko-legend"></div><div class="mekko-scroll"><div id="geographyMekko" class="mekko-chart" aria-label="Marimekko chart of mapped doctors by region and specialty"></div></div><p class="chart-caption">Column width = region share of mapped doctors. Segment height = specialty share within that region. Area = number of doctors. This is mapped coverage, not national workforce coverage.</p></section>');
    root.dataset.ready="true";
    $("#scopeQuery").oninput=event=>{coverageScope.query=event.target.value;renderCoverageWorkbench()};
    $("#scopeSpecialty").onchange=event=>{coverageScope.specialty=event.target.value;coverageScope.city="";renderCoverageWorkbench()};
    $("#scopeRegion").onchange=event=>{coverageScope.region=event.target.value;coverageScope.city="";renderCoverageWorkbench()};
    $("#scopeReset").onclick=()=>{Object.assign(coverageScope,{query:"",region:"",specialty:"",city:""});$("#scopeQuery").value="";$("#scopeRegion").value="";$("#scopeSpecialty").value="";renderCoverageWorkbench()};
  }
  const base=app.research.filter(p=>(!coverageScope.region||p.region===coverageScope.region)&&(!coverageScope.specialty||coverageSpecialty(p)===coverageScope.specialty)&&(!coverageScope.query||`${p.name} ${p.affiliation} ${p.city} ${p.specialty}`.toLowerCase().includes(coverageScope.query.toLowerCase())));
  const people=base.filter(p=>!coverageScope.city||p.city===coverageScope.city);
  if(!people.some(p=>p.id===coverageScope.selected))coverageScope.selected=people[0]?.id||"";
  const records=people.flatMap(p=>p.footprints);
  renderGeographyMekko(people);
  const cities=Object.entries(base.reduce((a,p)=>{a[p.city]=(a[p.city]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  $("#scopeCaption").textContent=`${people.length} verified doctors · ${coverageScope.region||"Pan India"}${coverageScope.city?` / ${coverageScope.city}`:""} · ${records.length} linked records`;
  $("#scopeCount").textContent=`${people.length} of ${app.research.length} profiles`;
  $("#scopeCities").innerHTML=cities.map(([city,count])=>`<button class="city-bar ${coverageScope.city===city?"selected":""}" data-scope-city="${esc(city)}" aria-pressed="${coverageScope.city===city}"><span>${esc(city)}</span><span class="city-track"><i style="width:${count/(cities[0]?.[1]||1)*100}%"></i></span><b>${count}</b></button>`).join("")||'<p class="scope-empty">No cities match these filters.</p>';
  const sourceTypes=[["PUBLICATION","Publications"],["CONFERENCE","Conferences"],["NEWS","News"],["SOCIAL","Social profiles"],["VIDEO","Video"],["INSTITUTION","Institutions"],["PROMOTION","Promotions"]];
  $("#scopeSources").innerHTML=sourceTypes.map(([type,label])=>{const count=records.filter(r=>r.type===type).length;return `<div class="source-measure"><span>${label}</span><b>${count}</b><span class="source-track"><i style="width:${records.length?count/records.length*100:0}%"></i></span></div>`}).join("");
  $("#scopeDoctors").innerHTML=people.map(p=>`<tr class="${p.id===coverageScope.selected?"selected":""}"><td><button class="doctor-select" data-scope-doctor="${esc(p.id)}" aria-pressed="${p.id===coverageScope.selected}">${esc(p.name)}</button><small>${esc(p.affiliation)}</small></td><td>${esc(p.city)}</td><td>${esc(p.tier)}</td><td>${p.footprints.length}</td></tr>`).join("")||'<tr><td colspan="4" class="scope-empty">No verified doctors match. Reset the filters to view all profiles.</td></tr>';
  root.querySelectorAll("[data-scope-city]").forEach(button=>button.onclick=()=>{coverageScope.city=coverageScope.city===button.dataset.scopeCity?"":button.dataset.scopeCity;renderCoverageWorkbench()});
  root.querySelectorAll("[data-scope-doctor]").forEach(button=>button.onclick=()=>{coverageScope.selected=button.dataset.scopeDoctor;renderCoverageWorkbench()});
  const person=people.find(p=>p.id===coverageScope.selected);
  $("#scopeProfile").innerHTML=person?`<p class="profile-eyebrow">EXPERT PROFILE</p><h2>${esc(person.name)}</h2><p>${esc(person.specialty)}</p><p class="profile-location">${esc(person.city)} · ${esc(person.state)}</p><dl class="profile-facts"><div><dt>Institution</dt><dd>${esc(person.affiliation)}</dd></div><div><dt>Analyst tier</dt><dd>${esc(person.tier)}</dd></div><div><dt>Identity match</dt><dd>${person.matchConfidence}%</dd></div></dl><h3>Supporting evidence <span>${person.footprints.length}</span></h3><div class="profile-evidence-list">${person.footprints.map(r=>`<a href="${esc(r.url)}" target="_blank" rel="noopener"><small>${esc(r.type.toLowerCase())} · ${esc(r.publisher)}</small><strong>${esc(r.title)}</strong><span>${esc(r.date||"Date unavailable")} · ${r.confidence==="REVIEW"?"Needs confirmation":"Identity matched"}</span></a>`).join("")}</div>`:'<p class="scope-empty">Select a doctor to review their profile and evidence.</p>';
}

function geographyMekkoData(people){
  const regions=[...new Set(["North","South","West","East","Central",...people.map(p=>p.region||"Unclassified")])];
  const specialties=["Endocrinology","Diabetology","Consulting physician","General practitioner"];
  return regions.map(region=>{
    const group=people.filter(p=>(p.region||"Unclassified")===region);
    return {region,count:group.length,width:people.length?group.length/people.length:0,segments:specialties.map((specialty,index)=>{
      const count=group.filter(p=>coverageSpecialty(p)===specialty).length;
      return {specialty,index,count,height:group.length?count/group.length:0};
    }).filter(segment=>segment.count)};
  }).filter(column=>column.count);
}

function renderGeographyMekko(people){
  const columns=geographyMekkoData(people);
  const labels=["Endocrinology","Diabetology","Consulting physician","General practitioner"];
  $("#mekkoTotal").textContent=`${people.length} mapped doctors · ${columns.length} regions`;
  $("#mekkoLegend").innerHTML=labels.map((label,index)=>`<span><i class="mekko-color-${index}"></i>${label}<b>${people.filter(p=>coverageSpecialty(p)===label).length}</b></span>`).join("");
  $("#geographyMekko").innerHTML=columns.length?columns.map(column=>`<div class="mekko-column" style="width:${column.width*100}%"><div class="mekko-column-label"><strong>${esc(column.region)}</strong><span>${column.count} · ${Math.round(column.width*100)}%</span></div><div class="mekko-stack">${column.segments.map(segment=>`<button class="mekko-segment mekko-color-${segment.index}" style="height:${segment.height*100}%" data-mekko-region="${esc(column.region)}" data-mekko-specialty="${esc(segment.specialty)}" title="${esc(column.region)} · ${esc(segment.specialty)}: ${segment.count} of ${column.count} doctors (${Math.round(segment.height*100)}%)" aria-label="Filter ${esc(column.region)}, ${esc(segment.specialty)}: ${segment.count} doctors"><strong>${segment.count}</strong><span>${segment.index===0?"Endo":segment.index===1?"Diabeto":segment.index===2?"CP":"GP"}</span></button>`).join("")}</div></div>`).join(""):'<p class="scope-empty">No mapped doctors in this selection. Reset filters to restore the geographic view.</p>';
  $("#geographyMekko").querySelectorAll("[data-mekko-region]").forEach(button=>button.onclick=()=>{
    Object.assign(coverageScope,{region:button.dataset.mekkoRegion,specialty:button.dataset.mekkoSpecialty,city:""});
    $("#scopeRegion").value=coverageScope.region;$("#scopeSpecialty").value=coverageScope.specialty;
    renderCoverageWorkbench();
  });
}
