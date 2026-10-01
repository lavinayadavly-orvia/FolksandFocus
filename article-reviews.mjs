// Visible-page observations; collection hashes invalidate reviews after a refresh.
export const articleReviews = Object.freeze([
{"url":"https://www.medanta.org/patient-education-blog/10-habits-for-managing-diabetes-and-lowering-high-blood-sugar-seek-medical-advice","cohortId":"HCP-11ce3f4f8d1b77505a","collectionSha256":"4dc9be2ac283724f4c733fbbf2630ef9dac559856ec92fd3369503fb75d7dc11","checkedAt":"2026-10-01","role":"REVIEWER","sourceAccessStatus":"PUBLIC_INDEX_READ","locator":"Medically Reviewed By credit adjoining title names Dr. Manish Gutch","observation":"Publicly indexed hospital article explicitly credits medical review. Identity corroborated by existing name-matched hospital profile backlink. Article wording is not imported as a personal statement; publication-date conflicts remain unresolved.","relationship":"Named clinical reviewer; authorship and personal commentary not established"},
{"url":"https://www.medanta.org/patient-education-blog/breaking-down-metabolic-syndrome-what-you-need-to-know-for-a-healthier-life","cohortId":"HCP-f5d5c20a66768bf364","collectionSha256":"c4b8588db0bc4fdd6808da72d1d8488a3f896e44c8e9f733ca3fd5fa4006ae72","checkedAt":"2026-10-01","role":"REVIEWER","sourceAccessStatus":"PUBLIC_INDEX_READ","locator":"Medically Reviewed By credit adjoining title names Dr. Harmandeep Kaur Gill (Wander)","observation":"Publicly indexed hospital article explicitly credits medical review. Identity corroborated by existing name-matched hospital profile backlink. Article wording is not imported as a personal statement; publication-date conflicts remain unresolved.","relationship":"Named clinical reviewer; authorship and personal commentary not established"},
{"url":"https://www.medanta.org/patient-education-blog/heart-failure-7-early-signs-that-should-not-be-ignored","cohortId":"HCP-547fac9580acf92aa2","collectionSha256":"7078a7d1e89d064325e6856575bafb71b072cf0d3457e6ec2d165381e69eb2e1","checkedAt":"2026-10-01","role":"REVIEWER","sourceAccessStatus":"PUBLIC_INDEX_READ","locator":"Medically Reviewed By credit adjoining title names Dr. Ashutosh Yadav","observation":"Publicly indexed hospital article explicitly credits medical review. Identity corroborated by existing name-matched hospital profile backlink. Article wording is not imported as a personal statement; publication-date conflicts remain unresolved.","relationship":"Named clinical reviewer; authorship and personal commentary not established"},
  ...[
    ['meals-mystery-and-missing-blood-supply','56608b94619b8074532fd215a97db3a848f3336f89725d179ad8409e22a2e64d'],
    ['one-valve-many-problems-tavi-reverses-downward-spiral-frail-octogenarian','5ea834b959fe48e28e9be811597a5f0fdf0bbd0afccc7156f7c9945610af3730'],
    ['stitch-time-multidisciplinary-management-complicated-crt-d-implantation','258d68d41b99e9ac4c13507e4c8d18b088a2f32828e993ad97dc1698a4e039b3']
  ].map(([slug,collectionSha256])=>({
    url:`https://www.asterhospitals.in/blogs-events-news/aster-aadhar-kolhapur/${slug}`,
    cohortId:'HCP-ad9e53f9ed116c428f',collectionSha256,checkedAt:'2026-10-01',role:'REVIEWER',
    locator:'Medically reviewed by Dr. Kaustubh Machnurkar beneath article title',
    observation:'Named medical reviewer confirmed on the visible hospital article. Case narrative does not independently establish authorship or a personal social-media statement.',
    relationship:'Named clinical reviewer; authorship not established'
  })),
  {
    url: 'https://www.manipalhospitals.com/ghaziabad/blog/how-to-reduce-cholesterol-ldl-hdl-triglycerides/',
    cohortId: 'HCP-c6f2c9a9b59259ff8b',
    collectionSha256: '540a17533ecb8973003ccfeb59489f1ccf15b942cb5aaef24e0ff124e628021a',
    checkedAt: '2026-10-01', role: 'REVIEWER',
    locator: 'Reviewed by credit beside heading identifies Dr. Geetesh Govil, Consultant Cardiology, Manipal Ghaziabad',
    observation: 'Visible page credits review, despite structured metadata reporting author. Collective hospital wording does not establish personal remarks.',
    relationship: 'Named clinical reviewer; personal authorship not established'
  },
  {
    url: 'https://www.manipalhospitals.com/ghaziabad/blog/lifestyle-changes-to-prevent-heart-disease/',
    cohortId: 'HCP-c6f2c9a9b59259ff8b',
    collectionSha256: 'b3d992fb3d7ec18f2e78d273de44e65295f513fca14a68fd2c899fd2c7359218',
    checkedAt: '2026-10-01', role: 'REVIEWER',
    locator: 'Reviewed by credit adjoining article heading identifies Dr. Geetesh Govil, Consultant Cardiology, Manipal Ghaziabad',
    observation: 'Visible reviewer credit takes precedence over structured author metadata. Not a native social post or attributed personal statement.',
    relationship: 'Named clinical reviewer; personal authorship not established'
  },
  {
    url: 'https://www.manipalhospitals.com/malleshwaram/blog/metabolism-hormones-and-hope-the-new-science-of-diabetes-and-metabolic-health/',
    cohortId: 'HCP-5a4cffebc04a08a942',
    collectionSha256: 'f0d5e26a82ee4718b5384ee165c2cc5ecc4a528f7baee23b818e59a7a5aeca84',
    checkedAt: '2026-09-30',
    role: 'REVIEWER',
    locator: 'Reviewed by credit adjoining the article heading links to Dr. Pooja U K, Consultant Endocrinologist, Manipal Malleshwaram',
    observation: 'Visible credit establishes review, despite structured metadata naming the clinician as author. Article text does not establish an individually attributed quotation or personal authorship.',
    relationship: 'Named clinical reviewer; authorship and personal commentary not established'
  },
  {
    url: 'https://www.manipalhospitals.com/jaipur/blog/diet-for-diabetes-foods-to-eat-avoid-portion-control/',
    cohortId: 'HCP-c4949ab28775bba01a',
    collectionSha256: '183f123d493c463ce2078d68a3a7ac0757867c90cfb6af0636a3c54b0da9b9ed',
    checkedAt: '2026-09-30',
    role: 'REVIEWER',
    locator: 'Reviewed by credit adjoining the article heading links to Dr. Abhishek Hajela, Consultant Diabetes and Endocrinology, Manipal Jaipur',
    observation: 'Page credits clinical review while structured metadata reports authorship. Collective hospital-specialist wording is not a personal quotation from the named reviewer.',
    relationship: 'Named clinical reviewer; authorship and personal commentary not established'
  },
  {
    url: 'https://www.asterhospitals.in/blogs-events-news/aster-aadhar-kolhapur/diabetic-ketoacidosis',
    cohortId: 'HCP-ad96c1d6fdc872cc32',
    collectionSha256: 'e6ee6aff6c57118977ab6cc56cd573674b9ed6843f65873e18160de6bfa9088f',
    checkedAt: '2026-09-30',
    role: 'REVIEWER',
    locator: 'Medically reviewed credit below the heading links to Dr. Yogesh Phirke at Aster Aadhar Kolhapur',
    observation: 'Visible credit establishes medical review. Structured metadata instead labels the same doctor as author; the article body does not identify individual remarks.',
    relationship: 'Named clinical reviewer; authorship and personal commentary not established'
  },
  {
    url: 'https://www.asterhospitals.in/blogs-events-news/aster-aadhar-kolhapur/thyroid-health-awareness-myths-facts-and-prevention-tips',
    cohortId: 'HCP-ad96c1d6fdc872cc32',
    collectionSha256: '3f96f08f7630aa7eec69e4c2076979a86b215743434d5f0f3859945b48631b43',
    checkedAt: '2026-09-30',
    role: 'REVIEWER',
    locator: 'Medically reviewed credit below the heading links to Dr. Yogesh Phirke at Aster Aadhar Kolhapur',
    observation: 'Visible reviewer credit conflicts with structured author metadata. Review is supported; personal authorship is unresolved.',
    relationship: 'Named clinical reviewer; authorship and personal commentary not established'
  },
  {
    url: 'https://www.asterhospitals.in/blogs-events-news/aster-aadhar-kolhapur/international-womens-day-2026-give-gain-prioritizing-womens-health',
    cohortId: 'HCP-5624a286aef5a95c7f',
    collectionSha256: '4517372e568394ad95c8a6b59484d2e708550fab0824cda3bcd6f3b8e5a5b7bd',
    checkedAt: '2026-09-30',
    role: 'REVIEWER',
    locator: 'Medically reviewed credit below the heading links to Dr. Nandita Paranjape Joshi at Aster Aadhar Kolhapur',
    observation: 'Structured metadata labels the reviewer as author. The body uses an unnamed first-person gynecologist voice; that alone does not resolve the conflicting authorship credit.',
    relationship: 'Named clinical reviewer; first-person authorship requires confirmation'
  },
  {
    url: 'https://www.manipalhospitals.com/baner/blog/angioplasty-techniques/',
    cohortId: 'HCP-ab9298d8c5cb95a939',
    collectionSha256: '498544268168761ad20976b1ab380d93f8515019ed5a6b4378d7c1b4373a9616',
    checkedAt: '2026-09-30',
    role: 'REVIEWER',
    locator: 'Reviewed by credit above the article heading, linked to Dr. Abhijit Joshi',
    observation: 'Visible page credits review, while structured metadata reports authorship. No individual statement is established by this credit.',
    relationship: 'Named clinical reviewer; authorship and personal commentary not established'
  }
]);
