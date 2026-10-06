import type { BrowserFinding, BrowserMissionResult } from "./browser-schemas.js";

export interface MissionDiagnosis {
  summary: string;
  confidence: "low" | "medium" | "high";
  nextAction: string;
}

export function diagnoseBrowserMission(
  status: BrowserMissionResult["status"],
  findings: BrowserFinding[]
): MissionDiagnosis {
  const first = findings[0];
  if (status === "PASS") {
    return { summary: "The browser mission completed without recorded failures.", confidence: "high", nextAction: "Use the returned evidence to verify the acceptance criteria." };
  }
  if (!first) {
    return { summary: "The mission did not establish a successful outcome, but produced no diagnostic finding.", confidence: "low", nextAction: "Collect additional evidence and rerun the mission." };
  }
  switch (first.kind) {
    case "assertion":
      return {
        summary: "An explicit browser assertion failed; the observed page state did not satisfy the requested condition.",
        confidence: "high",
        nextAction: "Inspect the preceding navigation/action evidence and determine whether the application state or the assertion target is incorrect."
      };
    case "target_blocked":
      return {
        summary: "The requested browser target was blocked by Muse's network security policy.",
        confidence: "high",
        nextAction: "Use an approved public HTTPS target; do not weaken the SSRF policy to make this mission pass."
      };
    case "timeout":
      return {
        summary: "The mission could not establish the requested outcome before its caller-controlled time budget expired.",
        confidence: "high",
        nextAction: "Increase the mission time budget only if justified, or reduce unnecessary waits and investigate the slow step."
      };
    case "interaction_budget":
      return {
        summary: "The mission reached its caller-controlled interaction budget before completing the requested work.",
        confidence: "high",
        nextAction: "Increase the interaction budget or simplify the test plan; this is not evidence that the target application passed."
      };
    case "cancelled":
      return {
        summary: "Execution was cancelled before the requested outcome was established.",
        confidence: "high",
        nextAction: "Rerun the mission when the caller is ready to allow completion."
      };
    default:
      return {
        summary: "Browser execution failed before the requested outcome was established.",
        confidence: "medium",
        nextAction: "Inspect the evidence and browser finding, then rerun with a targeted diagnostic step."
      };
  }
}
