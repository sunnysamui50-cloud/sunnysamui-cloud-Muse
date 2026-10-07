import test from "node:test";
import assert from "node:assert/strict";
import { parseConsoleMission } from "../src/console.js";

test("Console compiles natural-language browser instructions", () => {
  const mission = parseConsoleMission(
    "https://example.com",
    'Log in, search for "Wonderwall", open Discover, try the free trial, then log out. Do not purchase anything.'
  );

  assert.equal(mission.objective.includes("Log in"), true);
  assert.equal(mission.steps[0]?.type, "navigate");
  assert.equal(mission.steps.some((step) => step.type === "semanticClick" && /log in/i.test(step.target)), true);
  assert.equal(mission.steps.some((step) => step.type === "semanticType" && step.text === "Wonderwall"), true);
  assert.equal(mission.steps.some((step) => step.type === "semanticClick" && /^discover$/i.test(step.target)), true);
  assert.equal(mission.steps.some((step) => step.type === "semanticClick" && /free trial/i.test(step.target)), true);
  assert.equal(mission.steps.some((step) => step.type === "semanticClick" && /log out/i.test(step.target)), true);
});

test("Console still accepts an internal structured mission", () => {
  const mission = parseConsoleMission(
    "https://example.com",
    JSON.stringify({
      objective: "Load the site",
      instructions: "",
      acceptanceCriteria: ["The page loads"],
      steps: [{ type: "snapshot" }],
      maxDurationMs: 30000,
      maxInteractions: 5
    })
  );

  assert.equal(mission.steps[0]?.type, "navigate");
  assert.equal(mission.steps[0]?.url, "https://example.com/");
});
