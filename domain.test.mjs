import test from "node:test";
import assert from "node:assert/strict";
import { buildSocialMonitor } from "./social-monitor.mjs";
import { buildHcpAuditCard } from "./audit-card.mjs";
import { calculateInfluenceScore, caseCompleteness, transitionCase } from "./domain.mjs";
import { socialAccounts, socialPosts, researchProfiles } from './data.mjs';
import { sourceLibrary } from './source-library.mjs';

test('legacy LinkedIn profiles outside the canonical cohort remain in review, not cohort totals',()=>{
  const monitor=buildSocialMonitor(socialAccounts,socialPosts,researchProfiles);
  const linkedin=monitor.platformSummary.find(p=>p.platform==='LinkedIn');
  assert.equal(linkedin.accounts,3);
  const legacyLinkedIn=socialAccounts.filter(a=>a.platform==='LinkedIn'&&!researchProfiles.some(p=>p.id===a.hcpId));
  assert.equal(legacyLinkedIn.length,3);
  assert.ok(legacyLinkedIn.every(a=>monitor.quality.review.some(r=>r.id===a.id)));
  assert.equal(linkedin.posts,2);
  assert.equal(linkedin.lastCheckedAt,'2026-10-01');
  assert.equal(linkedin.status,'PUBLIC_OBSERVATION');
  assert.ok(monitor.accounts.filter(a=>a.platform==='LinkedIn').every(a=>a.identityEvidence&&a.profileUrl.includes('/in/')));
  const sources=sourceLibrary.filter(s=>s.platform==='LinkedIn');
  assert.ok(sources.some(s=>s.relationship==='Authored'));
  assert.ok(sources.some(s=>s.relationship==='Institutional mention'));
});

test("social monitor keeps accounts separate from captured posts",()=>{
  const result=buildSocialMonitor(
    [{id:"a1",hcpId:"h1",platform:"X",handle:"@doctor",profileUrl:"https://x.com/doctor",identityStatus:"VERIFIED",lastCheckedAt:"2026-09-24T12:00:00.000Z",collectionStatus:"CONNECTOR_REQUIRED"}],
    [],
    [{id:"h1",name:"Dr Test"}]
  );
  assert.equal(result.accounts[0].hcp,"Dr Test");
  assert.equal(result.accounts[0].postCount,0);
  assert.equal(result.platformSummary.find(item=>item.platform==="X").status,"CONNECTOR_REQUIRED");
  assert.equal(result.posts.length,0);
});

test("audit card exposes quality gates without inventing an authority score",()=>{
  const card=buildHcpAuditCard({id:"h1",name:"Dr Test",aliases:["Test"],specialty:"Endocrinology",affiliation:"Hospital",city:"Delhi",state:"Delhi",matchConfidence:98,tier:"Rising Voice",footprints:[{type:"INSTITUTION",confidence:"VERIFIED"},{type:"PUBLICATION",confidence:"REVIEW"}]});
  assert.equal(card.evidence.verified,1);
  assert.equal(card.evidence.review,1);
  assert.equal(card.qualityGates.find(item=>item.name==="All records reviewed").passed,false);
  assert.equal("score" in card.classification,false);
});
const hcp = { id:"hcp-test", verification:"VERIFIED", peerAuthority:80, clinicalRelevance:90, networkReach:70, recency:100 };
const accepted = { hcpId:"hcp-test", disposition:"ACCEPTED", quality:90 };
const review = { hcpId:"hcp-test", disposition:"REVIEW", quality:100 };

test("only accepted evidence contributes to evidence quality", () => {
  const score = calculateInfluenceScore(hcp, [accepted, review]);
  assert.equal(score.components.evidenceQuality, 90);
  assert.equal(score.acceptedEvidence, 1);
  assert.equal(score.evidenceCount, 2);
});

test("unverified identities receive lower confidence", () => {
  const verified = calculateInfluenceScore(hcp, [accepted]);
  const held = calculateInfluenceScore({ ...hcp, verification:"REVIEW" }, [accepted]);
  assert.ok(verified.confidence > held.confidence);
});

test("safety completeness reports each minimum criterion", () => {
  const result = caseCompleteness({ criteria:{ patient:true, reporter:false, product:true, event:true } });
  assert.deepEqual(result.map(item => item.present), [true,false,true,true]);
});

test("governed transitions allow validation but block direct submission", () => {
  const screened = { status:"SCREENED" };
  assert.equal(transitionCase(screened, "VALIDATED").status, "VALIDATED");
  assert.throws(() => transitionCase(screened, "SUBMITTED"), /not allowed/);
});
