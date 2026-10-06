import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseBrowserMission } from "../src/mission-diagnosis.js";

test("diagnosis explains assertion failures", () => {
  const result = diagnoseBrowserMission("FAIL", [{
    severity: "error", kind: "assertion", message: "text missing", stepIndex: 3
  }]);
  assert.equal(result.confidence, "high");
  assert.match(result.summary, /assertion failed/i);
});

test("diagnosis does not recommend weakening SSRF controls", () => {
  const result = diagnoseBrowserMission("BLOCKED", [{
    severity: "error", kind: "target_blocked", message: "private IP blocked"
  }]);
  assert.match(result.nextAction, /do not weaken/i);
});

test("diagnosis distinguishes unproven budget exhaustion", () => {
  const result = diagnoseBrowserMission("UNPROVEN", [{
    severity: "error", kind: "interaction_budget", message: "budget exhausted"
  }]);
  assert.match(result.summary, /interaction budget/i);
  assert.match(result.nextAction, /budget/i);
});


test("diagnosis explains unverified assertion-free missions", () => {
  const result = diagnoseBrowserMission("UNPROVEN", [{
    severity: "warning", kind: "unverified", message: "no executable assertion"
  }]);
  assert.match(result.summary, /not machine-verified/i);
  assert.match(result.nextAction, /explicit assert/i);
});
