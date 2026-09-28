import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { experienceTier, verifiedExperience } from '../experience.mjs';
import { validateProfile, validatePost, validateExtraction, SPECIALTIES, PV_CRITERIA, ARCHETYPES } from './models.mjs';
import { aggregateArchetypes } from './aggregation.mjs';
import { extractPost } from './extraction.mjs';
import { openLocalDatabase } from './local-database.mjs';
import { IntelligenceStore } from './store.mjs';
import { intelligenceApi } from './api.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { publicAsset } from './static-assets.mjs';

const now = new Date('2026-09-28T12:00:00Z');
const profile = (id = 'test-doctor') => ({ hcp_id: id, name: 'Test clinician', primary_specialty: 'Endocrinology', medical_registration_year: 1991, registration_source_url: 'https://example.org/registry/test', verified_by: 'Test reviewer', verified_at: '2026-09-28T00:00:00Z', handles: { x: { handle: '@test', source_url: 'https://example.org/account', verified_at: '2026-09-28T00:00:00Z' } } });
const post = (id = 'p1') => ({ post_id: id, hcp_id: 'test-doctor', platform: 'x', timestamp: '2026-09-27T10:00:00Z', text: 'My patient experienced nausea after semaglutide.', author_handle: '@test', source_url: `https://example.org/post/${id}`, collection_basis: 'authorised_manual' });
const extraction = () => ({ in_scope: true, extracted_archetype: 'Frontline_Pragmatist', specialty_angle: 'Tolerability', entities: [{ name: 'semaglutide', category: 'Molecule' }], clinical_sentiment: 'Neutral', primary_clinical_critique: '', practice_friction_type: 'Tolerability_GI', pv_criteria_validation: Object.fromEntries(PV_CRITERIA.map(k => [k, true])), pv_evidence: { identifiable_patient: 'My patient', identifiable_reporter: '@test', suspect_product: 'semaglutide', adverse_event: 'nausea' }, pv_audit_rationale: 'Possible case; qualified review required.' });
const env = { INTELLIGENCE_API_TOKEN: 'test-token-only-not-a-real-secret-123456', OPENAI_API_KEY: 'fake-test-key', INTELLIGENCE_LLM_ENABLED: 'true' };
const request = (path, method = 'GET', data, auth = true) => new Request(`http://localhost/api/intelligence/${path}`, { method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${env.INTELLIGENCE_API_TOKEN}` } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
async function setup(t) { const db = await openLocalDatabase(':memory:'); t.after(() => db.close()); return new IntelligenceStore(db); }

test('every hard experience boundary, missing/future years, calendar rollover', () => {
  for (const [years, tier] of [[0,'Early_Spark'],[9,'Early_Spark'],[10,'Frontline_Fair'],[17,'Frontline_Fair'],[18,'Rising_Star'],[24,'Rising_Star'],[25,'Trendsetter'],[34,'Trendsetter'],[35,'Trailblazer'],[60,'Trailblazer']]) assert.equal(experienceTier(2026-years, now).id, tier);
  for (const year of [null, 2027, 1949, '1991', 1991.5]) assert.equal(experienceTier(year, now), null);
  assert.equal(experienceTier(1992, new Date('2027-01-01T00:00:00Z')).id, 'Trailblazer');
  assert.equal(verifiedExperience(profile(), now), null);
});
test('all specialties validate; direct tier override and unverified registration are rejected', () => {
  for (const specialty of SPECIALTIES) assert.equal(validateProfile({...profile(), primary_specialty: specialty}, now).primary_specialty, specialty);
  for (const patch of [{experience_tier:'Trailblazer'},{medical_registration_year:2027},{registration_source_url:''},{verified_by:''},{verified_at:'invalid'},{primary_specialty:'Unknown'}]) assert.throws(() => validateProfile({...profile(),...patch}, now));
});
test('cohort-first ingestion rejects wrong author; unknown metrics remain null', () => {
  const hcp = validateProfile(profile(), now);
  const normalized = validatePost(post(), hcp, now);
  assert.equal(normalized.engagement.likes, null);
  for (const patch of [{author_handle:'@someoneelse'},{timestamp:'2027-01-01T00:00:00Z'},{timestamp:'2026-02-30T00:00:00Z'},{engagement:{likes:-1}},{collection_basis:'scraped_private'},{platform:'unknown'}]) assert.throws(() => validatePost({...post(),...patch}, hcp, now));
  assert.throws(() => validatePost(post(), {...hcp,verification_status:'PENDING'}, now));
});
test('PV all 16 combinations are computed server-side; incomplete adverse events retained', () => {
  for (let bits=0; bits<16; bits++) {
    const data=extraction(); PV_CRITERIA.forEach((key,i)=>{data.pv_criteria_validation[key]=Boolean(bits&(1<<i));if(!data.pv_criteria_validation[key])data.pv_evidence[key]=null;});
    const result=validateExtraction(data,post());
    assert.equal(result.pv_adverse_event_suspected,bits===15);
    assert.equal(result.pv_review_required,Boolean(bits&8));
  }
  assert.throws(()=>validateExtraction({...extraction(),pv_adverse_event_suspected:true},post()));
  const invented=extraction();invented.pv_evidence.adverse_event='pancreatitis';assert.throws(()=>validateExtraction(invented,post()));
  const negated=extraction();negated.pv_criteria_validation.adverse_event=false;negated.pv_evidence.adverse_event=null;
  assert.equal(validateExtraction(negated,{...post(),text:'My patient had no nausea after semaglutide.'}).pv_adverse_event_suspected,false);
});
test('90-day publication window excludes stale/future posts and deduplicates reprocessing', () => {
  const row=(id,time,kind=ARCHETYPES[0])=>({platform:'x',post_id:id,timestamp:time,extracted_archetype:kind});
  const boundary=new Date(now.getTime()-90*86400000).toISOString();
  const rows=[row('a',boundary),row('a',boundary),row('old','2026-01-01T00:00:00Z'),row('future','2027-01-01T00:00:00Z'),row('b',now.toISOString(),ARCHETYPES[1]),row('c',now.toISOString()),row('d',now.toISOString(),null)];
  const result=aggregateArchetypes(rows,now);
  assert.equal(result.posts_in_window,4);assert.equal(result.primary_behavioral_archetype,ARCHETYPES[0]);assert.equal(result.secondary_behavioral_archetype,null);
  assert.equal(aggregateArchetypes(rows.filter(r=>r.post_id!=='d'),now).secondary_behavioral_archetype,ARCHETYPES[1]);
  assert.equal(aggregateArchetypes([],now).primary_behavioral_archetype,null);
  assert.equal(aggregateArchetypes([row('a',boundary),row('b',boundary,ARCHETYPES[1])],now).tied_primary,true);
});
test('provider schema, refusal, incomplete, rate limits and invalid output handling', async () => {
  const p=validatePost(post(),validateProfile(profile(),now),now);
  const good=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(extraction())}]}]});};
  assert.equal((await extractPost(p,env,good)).pv_adverse_event_suspected,true);
  await assert.rejects(extractPost(p,{},good),/not configured/);
  for(const data of [{status:'incomplete'},{status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]},{status:'completed',output:[{content:[{type:'output_text',text:'{}'}]}]}]) await assert.rejects(extractPost(p,env,async()=>Response.json(data)));
  await assert.rejects(extractPost(p,env,async()=>new Response('',{status:429})),/429/);
});
test('persisted cohort, atomic batches, duplicate guard and audited revision changes', async t => {
  const store=await setup(t);await store.seedDossiers([{id:'pending',name:'Unverified'}],now);
  assert.equal((await store.summaries(now))[0].experience_tier,null);
  await store.saveProfile(profile(),{},now);
  await assert.rejects(store.ingest([post(),{...post('bad'),hcp_id:'pending'}],now));
  assert.equal((await store.db.all('SELECT count(*) n FROM intelligence_posts'))[0].n,0);
  assert.deepEqual(await store.ingest([post(),post()],now),{accepted:1,duplicates:1,extraction_status:'PENDING'});
  assert.equal((await store.ingest([post()],now)).accepted,0);
  await assert.rejects(store.ingest([{...post(),text:'different'}],now),/different content/);
  await assert.rejects(store.saveProfile({...profile(),medical_registration_year:2001},{expectedRevision:0},now),/revision conflict/);
  await store.saveProfile({...profile(),medical_registration_year:2001},{expectedRevision:1,reason:'Registry correction'},now);
  assert.equal((await store.getProfile('test-doctor')).revision,2);
  assert.equal((await store.summaries(now)).find(p=>p.hcp_id==='test-doctor').experience_tier,'Trendsetter');
});
test('processing, two-axis analytics, PV review and audit operate end to end', async t => {
  const store=await setup(t);await store.saveProfile(profile(),{},now);await store.ingest([post()],now);
  const extractor=async p=>({...validateExtraction(extraction(),p),model:'test-model',prompt_version:'test-v1'});
  assert.equal((await store.process(5,env,now,extractor)).items[0].status,'COMPLETE');
  assert.equal((await store.process(5,env,now,extractor)).items.length,0);
  const summary=(await store.summaries(now))[0];assert.equal(summary.experience_tier,'Trailblazer');assert.equal(summary.primary_behavioral_archetype,'Frontline_Pragmatist');
  const result=await store.analytics({tier:{min:35,max:null},archetype:'Frontline_Pragmatist',limit:10,offset:0},now);assert.equal(result.total,1);
  assert.equal((await store.analytics({tier:{min:18,max:24},limit:10,offset:0},now)).total,0);
  assert.equal((await store.safety(10,0)).length,1);
  await store.reviewSafety({platform:'x',post_id:'p1',status:'CONFIRMED',reason:'Reviewed source',reviewer:'Test reviewer'},now);
  await assert.rejects(store.reviewSafety({platform:'x',post_id:'p1',status:'DISMISSED'},now),/already reviewed/);
  assert.equal((await store.safety(10,0))[0].review_status,'CONFIRMED');
  assert.equal((await store.db.all("SELECT * FROM intelligence_audit WHERE action='PV_REVIEWED'")).length,1);
});
test('retry ceiling leaves failed posts inspectable and never creates empty extraction',async t=>{
  const store=await setup(t);await store.saveProfile(profile(),{},now);await store.ingest([post()],now);
  const fail=async()=>{throw Error('provider failure')};
  for(let i=0;i<3;i++)assert.equal((await store.process(1,env,now,fail)).items[0].status,'FAILED');
  assert.equal((await store.process(1,env,now,fail)).items.length,0);
  assert.equal((await store.db.all('SELECT * FROM intelligence_extractions')).length,0);
});
test('API authorization, malformed bodies, pagination, missing config and Cloudflare parity',async t=>{
  const store=await setup(t),call=req=>intelligenceApi(req,{store,env,now});
  assert.equal((await call(request('hcps','GET',undefined,false))).status,401);
  assert.equal((await call(request('hcps','POST',{profile:profile(),reason:'Verified test registry'}))).status,201);
  assert.equal((await call(request('ingest','POST',{posts:[post()]}))).status,202);
  assert.equal((await call(request('analytics?tier=wrong'))).status,422);
  assert.equal((await call(request('analytics?limit=0'))).status,422);
  assert.equal((await call(request('analytics?offset=-1'))).status,422);
  assert.equal((await call(request('summary','GET',undefined,false))).status,200);
  assert.equal((await intelligenceApi(request('hcps'),{store,env:{},now})).status,503);
  assert.equal((await intelligenceApi(request('summary'),{store:null,env,now})).status,503);
  const malformed=new Request('http://localhost/api/intelligence/ingest',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${env.INTELLIGENCE_API_TOKEN}`},body:'{'});
  assert.equal((await call(malformed)).status,400);
  const cloud=await onRequest({request:request('status'),params:{path:['intelligence','status']},env:{}});
  assert.equal((await cloud.json()).storage,'NOT_CONFIGURED');
});
test('SQLite data survives reopening',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'folksandfocus-test-')),path=join(dir,'test.sqlite');
  try {let db=await openLocalDatabase(path);await new IntelligenceStore(db).saveProfile(profile(),{},now);db.close();db=await openLocalDatabase(path);assert.equal((await new IntelligenceStore(db).getProfile('test-doctor')).name,'Test clinician');db.close();}finally{await rm(dir,{recursive:true,force:true});}
});
test('static serving excludes databases, secrets, backend code and traversal',()=>{
  for(const path of ['/intelligence.sqlite','/.env','/.git/config','/backend/schema.sql','/../.folksandfocus-data/intelligence.sqlite','/%2e%2e/intelligence.sqlite']) assert.equal(publicAsset(path),null);
  for(const path of ['/','/experience.mjs','/favicon.png']) assert.ok(publicAsset(path));
});
test('Cloudflare D1 adapter executes the same persisted endpoint contract',async t=>{
  const store=await setup(t);
  const binding={
    prepare(sql){return {bind(...params){return {sql,params,all:async()=>({results:await store.db.all(sql,params)})}}}},
    batch(statements){return store.db.batch(statements.map(s=>[s.sql,s.params]));}
  };
  const call=(path,method='GET',body)=>onRequest({request:request(path,method,body),params:{path:['intelligence',...path.split('/')]},env:{...env,INTELLIGENCE_DB:binding}});
  assert.equal((await call('hcps','POST',{profile:profile(),reason:'Verified fixture'})).status,201);
  assert.equal((await call('ingest','POST',{posts:[post()]})).status,202);
  assert.equal((await (await call('summary')).json()).items[0].experience_tier,'Trailblazer');
  assert.equal((await (await call('analytics')).json()).total,1);
});
