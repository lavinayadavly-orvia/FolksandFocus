import test from "node:test";
import assert from "node:assert/strict";
import { calculateInfluenceScore, caseCompleteness, transitionCase } from "./domain.mjs";

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
