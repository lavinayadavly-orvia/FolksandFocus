export const cohortIdentityReviews = Object.freeze([
  {
    cohortId: 'HCP-0538114585aa5b45df', name: 'Self Self',
    url: 'https://www.carehospitals.com/doctor/hyderabad/hitec-city/self-general-medicine-doctor',
    checkedAt: '2026-10-01', status: 'IDENTITY_NOT_ESTABLISHED',
    sourceAccessStatus: 'PUBLIC_INDEX_READ',
    basis: 'Suspected placeholder: institutional page repeats Self Self in heading and generic booking FAQs, with no qualifications, biography or identifiable clinician details. Retain the captured record for review; exclude from active physician counts until identity is established.'
  }
]);

export const cohortSpecialtyReviews = Object.freeze([
  {
    cohortId:'HCP-1bfff86e5493f12193',name:'Dilish Malik',
    url:'https://www.maxhealthcare.in/doctor/dr-dilish-malik',checkedAt:'2026-10-01',
    specialties:['Aviation Medicine'],sourceAccessStatus:'PUBLIC_INDEX_READ',
    basis:'Named Senior Consultant Aviation Medicine role and MD Aviation Medicine qualification distinguish individual specialty from broad Internal Medicine website category; original category retained in evidence.'
  },
  {
    cohortId:'HCP-bf22da196a0e15e0d9',name:'Rituparna Das',
    url:'https://www.manipalhospitals.com/broadway/doctors/dr-rituparna-das-internal-medicine-specialist/',
    checkedAt:'2026-10-01',specialties:['Pain Medicine','Anaesthesiology'],sourceAccessStatus:'PAGE_CHECKED',
    basis:'Explicit biography identifies interventional pain physician and anaesthesiologist, with MD/DNB Anaesthesiology and pain medicine fellowships. Broad Internal Medicine heading is retained as collected, not treated as the individual specialty.'
  },
  {
    cohortId:'HCP-06277c461ad404a271',name:'Shankarappa Kabber',
    url:'https://www.manipalhospitals.com/malleshwaram/doctors/dr-shankarappa-kabber-consultant-intensivist/',
    checkedAt:'2026-10-01',specialties:['Critical Care Medicine','Anaesthesiology'],sourceAccessStatus:'PAGE_CHECKED',
    basis:'Hospital identifies consultant intensivist with diploma and MD Anaesthesiology. Critical care qualifications do not establish cardiology or internal medicine specialist credentials.'
  },
  {
    cohortId:'HCP-134df87cfd91b880d9',name:'Bhupendra Patil',
    url:'https://www.asterhospitals.in/doctors/aster-aadhar-kolhapur/dr-bhupendra-patil',
    checkedAt:'2026-10-01',specialties:['Cardiothoracic and Vascular Surgery'],sourceAccessStatus:'PAGE_CHECKED',
    basis:'Hospital biography explicitly identifies cardiothoracic and vascular surgery and MCh training. Preserve original website category without representing a surgeon as a cardiologist.'
  },
  {
    cohortId:'HCP-cb4ac53d726460d982',name:'Javid Raja',
    url:'https://www.kauveryhospital.com/doctors/trichy-heartcity/cardiology/dr-javid-raja/',
    checkedAt:'2026-10-01',specialties:['Paediatric Cardiac Surgery'],sourceAccessStatus:'PAGE_CHECKED',
    basis:'Explicit consultant paediatric cardiac surgeon role and MS/MCh/FPCS qualifications override the broad Cardiology website category. Original category remains in evidence.'
  },
  {
    cohortId:'HCP-0337b0c2cc865b4c9f',name:'Karthikeyan B',
    url:'https://www.kauveryhospital.com/doctors/chennai-radial-road/cardiology/dr-karthikeyan-b/',
    checkedAt:'2026-10-01',specialties:['Cardiothoracic and Vascular Surgery'],sourceAccessStatus:'PAGE_CHECKED',
    basis:'Explicit consultant CTVS role and MS/MCh/FRCS support surgical specialty, not cardiologist qualification. Broad Cardiology tag preserved in original evidence.'
  },
  {
    cohortId: 'HCP-b6cc93ca75ecb1e120', name: 'Girish I R',
    url: 'https://www.asterhospitals.in/doctors/aster-whitefield-bangalore/dr-girish-i-r',
    checkedAt: '2026-10-01', specialties: ['Critical Care Medicine', 'Cardiac Anaesthesiology'],
    sourceAccessStatus: 'PUBLIC_INDEX_READ',
    basis: 'Explicit consultant intensive-care role, MD Anesthesia and transplant anaesthesia fellowship support critical care and cardiac anaesthesia, not an individual cardiologist qualification. Broad Cardiology tag retained in original evidence.'
  },
  {
    cohortId: 'HCP-f783a3962420622eeb', name: 'A. Murshid Ahamed',
    url: 'https://www.kauveryhospital.com/doctors/trichy-heartcity/cardiology/dr-a-murshid-ahamed/',
    checkedAt: '2026-10-01', specialties: ['Cardiac Anaesthesiology'],
    sourceAccessStatus: 'PUBLIC_INDEX_READ',
    basis: 'Explicit role is Senior Registrar in Cardiac Anaesthesiology with MD (Anes) and PDCC. The broad Cardiology directory category is not an individual cardiologist qualification.'
  }
]);

export function applyCohortSpecialtyReview(person, reviews = cohortSpecialtyReviews) {
  const review = reviews.find(item => item.cohortId === person.cohort_id);
  if (!review) return person;
  if (person.name !== review.name || !person.profile_urls.includes(review.url)) {
    throw new Error(`Cohort specialty review needs revalidation: ${person.cohort_id}`);
  }
  return {...person, specialties: [...review.specialties], specialtyReview: {...review, asCollected: [...person.specialties]}};
}

export function applyCohortIdentityReviews(cohort, reviews = cohortIdentityReviews) {
  const quarantined = [], doctors = [];
  for (const person of cohort.doctors) {
    const review = reviews.find(r => r.cohortId === person.cohort_id);
    if (!review) { doctors.push(applyCohortSpecialtyReview(person)); continue; }
    if (person.name !== review.name || !person.profile_urls.includes(review.url)) {
      throw new Error(`Cohort identity review needs revalidation: ${person.cohort_id}`);
    }
    quarantined.push({record: person, review});
  }
  const memberships = {}, publishers = {}, sources = new Set();
  for (const person of doctors) {
    for (const specialty of new Set(person.specialties)) memberships[specialty] = (memberships[specialty] || 0) + 1;
    for (const publisher of new Set(person.evidence.map(e => e.publisher))) publishers[publisher] = (publishers[publisher] || 0) + 1;
    for (const evidence of person.evidence) sources.add(evidence.source_id);
  }
  return {...cohort, doctors, identityReview: quarantined, summary: {...cohort.summary,
    captured_unique_count: cohort.doctors.length, confirmed_unique_count: doctors.length,
    identity_review_count: quarantined.length, remaining: Math.max(0, cohort.summary.target - doctors.length),
    excluded_or_review_records: cohort.summary.excluded_or_review_records + quarantined.length,
    specialty_memberships: memberships, publisher_counts: publishers,
    sources_supporting_accepted_cohort: sources.size}};
}

// Preserve collection snapshots; project only evidence-free identity holds into current totals.
export function projectCollectionToCohort(collection, cohort) {
  const ids = new Set(cohort.doctors.map(p => p.cohort_id));
  const summary = {...collection.summary, collectedCohortTotal: collection.summary.cohortTotal, cohortTotal: ids.size};
  if (collection.doctors) {
    const removed = collection.doctors.filter(p => !ids.has(p.cohortId));
    if (removed.some(p => p.candidates?.length)) throw new Error('Quarantined identity has source candidates requiring evidence review');
    const doctors = collection.doctors.filter(p => ids.has(p.cohortId));
    if (summary.counts) summary.counts = Object.fromEntries(Object.keys(summary.counts).map(status => [status, doctors.filter(p => p.status === status).length]));
    if ('doctorsWithPageChecks' in summary) summary.doctorsWithPageChecks = doctors.filter(p => p.pageChecked).length;
    if ('sharedLinkOccurrencesExcluded' in summary) summary.sharedLinkOccurrencesExcluded = doctors.reduce((n,p) => n + (p.sharedLinksExcluded || 0), 0);
    return {...collection, doctors, summary};
  }
  if (collection.searches) {
    if (collection.links.some(r => !ids.has(r.cohortId)) || collection.review.some(r => r.cohortIds.some(id => !ids.has(id)))) {
      throw new Error('Quarantined identity has publication attribution requiring evidence review');
    }
    const searches = collection.searches.filter(p => ids.has(p.cohortId));
    summary.searched = searches.filter(p => p.status === 'COMPLETE').length;
    return {...collection, searches, summary};
  }
  throw new Error('Unsupported cohort collection projection');
}
