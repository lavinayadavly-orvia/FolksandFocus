import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAsset } from './backend/static-assets.mjs';
import { activitySummary, doctorNames, listeningWindow, statementFacets, filterLens, compareLens, discoverPhrases, clinicalSubjects, formatTopicLabel } from './listening-analytics.mjs';

test('topic labels use title case and retain medical abbreviation casing',()=>{
  assert.equal(formatTopicLabel('weight loss'),'Weight Loss');
  assert.equal(formatTopicLabel('chronic disease'),'Chronic Disease');
  assert.equal(formatTopicLabel('glp-1 therapies'),'GLP-1 Therapies');
  assert.equal(formatTopicLabel('t2dm ckd hba1c'),'T2DM CKD HbA1c');
});

test('topic discovery follows new clinical language without obesity categories',()=>{
  const rows=[{id:'a',text:'CKD kidney protection matters.',who:'Dr A',source:'one'},{id:'b',text:'T2DM kidney protection evidence.',who:'Dr B',source:'two'}];
  const found=discoverPhrases(rows);
  assert.ok(found.some(t=>t.name==='kidney protection'));
  assert.ok(!found.some(t=>/obesity|efficacy|safety/i.test(t.name)));
  assert.deepEqual(found.find(t=>t.name==='kidney protection').statementIds,['a','b']);
  assert.deepEqual(discoverPhrases([rows[0],{...rows[0],id:'duplicate'}]),[]);
  assert.deepEqual(discoverPhrases([]),[]);
});

test('clinical subjects use statement text, not the doctor specialty or inferred indication',()=>{
  assert.deepEqual(clinicalSubjects({text:'T2DM and CKD',specialty:'Obesity'}),['T2DM','CKD']);
  assert.deepEqual(clinicalSubjects({text:'Semaglutide',specialty:'Endocrinology'}),['Other / not explicitly identified']);
  assert.deepEqual(clinicalSubjects({text:'Type 2 diabetes'}),['T2DM']);
  assert.deepEqual(clinicalSubjects({text:'Diabetes'}),['Diabetes (type unspecified)']);
});

test('entity lenses preserve explicit attribution and unknowns',()=>{
  assert.deepEqual(statementFacets({text:'Semaglutide safety'}).brand,['Unspecified brand']);
  assert.deepEqual(statementFacets({text:'Ozempic'}).molecule,['Unspecified molecule']);
  assert.deepEqual(statementFacets({text:'Generic and innovator semaglutide'}).origin,['Generic','Innovator']);
  assert.deepEqual(statementFacets({text:'Mounjaro'}).origin,['Unspecified origin']);
  assert.deepEqual(statementFacets({text:'NotOzempic'}).brand,['Unspecified brand']);
  assert.deepEqual(statementFacets({text:'Wegovy and Mounjaro'}).brand,['Wegovy','Mounjaro']);
});

test('lens comparisons reconcile with filtered source evidence',()=>{
  const w=listeningWindow(new Date('2026-09-28T00:00:00Z'));
  for(const dimension of ['brand','molecule','origin','specialty']){
    for(const group of compareLens(S,dimension,SOURCE_LINKS,w)){
      const subset=filterLens(S,dimension,group.value);
      const expected=activitySummary(subset,SOURCE_LINKS,w);
      assert.equal(group.doctors,expected.doctors);
      assert.equal(group.activities,expected.activities.length);
      assert.equal(group.statements,expected.statements);
    }
  }
  assert.deepEqual(filterLens(S,'brand','Nonexistent'),[]);
});

test('activity dashboard deduplicates quotations and separates collective voices', () => {
  const w = listeningWindow(new Date('2026-09-28T00:00:00Z'));
  assert.equal(w.start, '2025-10-01');
  assert.equal(w.months.length, 12);
  const summary = activitySummary(S, SOURCE_LINKS, w);
  assert.ok(summary.activities.length < summary.statements);
  assert.equal(summary.months.reduce((n,m)=>n+m.activities,0), summary.activities.length);
  assert.ok(summary.doctors > 0);
  assert.ok(summary.otherVoices > 0);
  assert.deepEqual(doctorNames({who:"Dr. Mohan's Diabetes Specialities Centre"}), []);
  assert.equal(doctorNames({who:'Dr Amit Bhargava & Dr Varsha Narayanan'}).length, 2);
});

test('empty and future windows never manufacture activity', () => {
  const w = listeningWindow(new Date('2024-01-31T00:00:00Z'));
  const summary = activitySummary(S, SOURCE_LINKS, w);
  assert.equal(summary.activities.length, 0);
  assert.equal(summary.doctors, 0);
  assert.ok(summary.months.every(m=>m.activities===0));
});
import { LISTENING_STATEMENTS as S, THEMES, THEME_DETAIL, SPECIALTY_PROFILES, KEY_VOICES, SOURCE_COVERAGE, SOURCE_LINKS, QUARTERS, netOf, splitOf, quarterOf, groupBy, filterStatements, themeShift } from './listening-data.mjs';

// Figures for the source-checked corpus (28 Sep 2026). The listening report showed 67 statements from 37 voices;
test('local server allows all Listening entry assets', () => {
  for (const asset of ['listening.css', 'listening-ui.mjs', 'listening-data.mjs', 'listening-analytics.mjs']) {
    assert.equal(publicAsset(`/${asset}`), asset);
  }
});

// source checking reattributed one quote and removed two article-voice sentences (see LISTENING_META.corrections).
test('ledger reproduces the source-checked headline figures', () => {
  assert.equal(S.length, 65);
  assert.equal(new Set(S.map(r => r.who)).size, 36);
  assert.deepEqual(splitOf(S), [19, 23, 23]);
  assert.equal(netOf(S), 6);
  assert.equal(S.filter(r => r.wave2).length, 29);
  assert.equal(netOf(S.filter(r => r.date.startsWith('2025'))), 19);
  assert.equal(netOf(S.filter(r => r.date.startsWith('2026'))), 0);
});

test('specialty volumes and net sentiment', () => {
  const expected = { 'Endocrinology': [23, 22], 'Bariatric & metabolic surgery': [11, 27], 'Diabetology': [9, 0], 'General medicine': [6, -33], 'Societies & multi-specialty panels': [5, 0], 'Neurology': [4, -50], 'Nutrition & dietetics': [3, -67], 'Cardiology': [2, 100], 'Obstetrics & gynaecology': [1, 100], 'Obesity clinic': [1, -100] };
  const g = groupBy(S, 'specialty');
  assert.equal(g.size, Object.keys(expected).length);
  for (const [k, [n, net]] of Object.entries(expected)) { assert.equal(g.get(k).length, n, k); assert.equal(netOf(g.get(k)), net, k); assert.ok(SPECIALTY_PROFILES[k], k); }
});

test('theme volumes and net sentiment', () => {
  const expected = { 'Efficacy': [14, 71], 'Safety & tolerability': [12, -17], 'Cost': [4, -25], 'Availability & access': [7, -57], 'Effect on patients': [10, -10], 'Impact & disease framing': [16, 81], 'Appropriate use & misuse': [22, -45], 'Quality & counterfeits': [6, -83] };
  for (const { name } of THEMES) { const v = S.filter(r => r.themes.includes(name)); assert.deepEqual([v.length, netOf(v)], expected[name], name); assert.equal(THEME_DETAIL[name].points.length, 4); }
  assert.ok(S.every(r => r.themes.every(t => expected[t])));
});

test('quarterly and channel volumes', () => {
  assert.deepEqual(QUARTERS.map(q => S.filter(r => quarterOf(r.date) === q).length), [4, 7, 3, 7, 16, 20, 8]);
  const channels = { 'Indian news & business media': 24, 'Society publications & consensus': 12, 'International media & wires': 7, 'X (Twitter)': 5, 'Conference / CME': 5, 'Medical education & trade media': 5, 'Hospital & clinic blogs': 4, 'Lifestyle interview': 2, 'Peer-reviewed research': 1 };
  const g = groupBy(S, 'channel');
  for (const [k, n] of Object.entries(channels)) assert.equal(g.get(k)?.length, n, k);
});

test('agenda shift follows the published direction for every theme', () => {
  const sign = { 'Efficacy': -1, 'Safety & tolerability': 1, 'Cost': 1, 'Availability & access': 1, 'Effect on patients': 1, 'Impact & disease framing': 1, 'Appropriate use & misuse': -1, 'Quality & counterfeits': 1 };
  for (const x of themeShift(S)) assert.equal(Math.sign(x.delta), sign[x.name], x.name);
});

test('every statement links to a checked source page', () => {
  for (const r of S) { const l = SOURCE_LINKS[r.source]; assert.ok(l, r.source); assert.match(l.url, /^https:\/\//); assert.ok(['page', 'index'].includes(l.check)); }
  assert.ok(Object.values(SOURCE_LINKS).filter(l => l.check === 'index').every(l => l.url.startsWith('https://x.com/')));
});

test('source coverage totals and key voices are consistent', () => {
  const rows = SOURCE_COVERAGE.flatMap(g => g.rows);
  assert.equal(rows.length, 29);
  const count = k => rows.filter(r => r[1] === k).length;
  assert.deepEqual([count('CAPTURED'), count('PARTIAL'), count('NONE'), count('RESTRICTED')], [13, 7, 4, 5]);
  for (const v of KEY_VOICES) assert.ok(S.some(r => r.who === v.who), v.who);
});

test('every statement is complete and filters compose', () => {
  for (const r of S) { assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/); for (const k of ['who', 'role', 'specialty', 'text', 'source', 'sentiment', 'framing', 'channel']) assert.ok(r[k], `${r.id} ${k}`); }
  assert.equal(new Set(S.map(r => r.id)).size, S.length);
  assert.equal(filterStatements(S, { theme: 'Quality & counterfeits', period: '2025' }).length, 0);
  assert.equal(filterStatements(S, { specialty: 'Neurology', sentiment: 'Negative' }).length, 2);
  assert.equal(filterStatements(S, { query: 'aiims' }).length, 2);
});
