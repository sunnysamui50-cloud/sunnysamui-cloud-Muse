import { z } from "zod";

const HttpsUrl = z.string().url().refine((value) => value.startsWith("https://"), "URL must use HTTPS");
const StepBase = z.object({ timeoutMs: z.number().int().min(1000).max(15000).optional() }).strict();
const NavigateStep = StepBase.extend({ type: z.literal("navigate"), url: HttpsUrl });
const SnapshotStep = StepBase.extend({ type: z.literal("snapshot"), maxChars: z.number().int().min(500).max(20000).default(12000) });
const ScreenshotStep = StepBase.extend({ type: z.literal("screenshot"), fullPage: z.boolean().default(false) });
const ClickTarget = z.object({
  role: z.enum(["button", "link", "textbox", "heading", "checkbox", "combobox"]).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  text: z.string().trim().min(1).max(200).optional(),
  selector: z.string().trim().min(1).max(300).optional()
}).strict().refine((value) => Boolean(value.name ?? value.text ?? value.selector), "Click target requires name, text, or selector");
const ClickStep = StepBase.extend({ type: z.literal("click"), target: ClickTarget });
const TypeTarget = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  placeholder: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  selector: z.string().trim().min(1).max(300).optional(),
  role: z.literal("textbox").default("textbox")
}).strict().refine((value) => Boolean(value.label ?? value.placeholder ?? value.name ?? value.selector), "Type target requires label, placeholder, name, or selector");
const TypeStep = StepBase.extend({ type: z.literal("type"), target: TypeTarget, text: z.string().max(2000), submit: z.boolean().default(false) });
const WaitStep = StepBase.extend({
  type: z.literal("wait"),
  milliseconds: z.number().int().min(100).max(10000).optional(),
  text: z.string().trim().min(1).max(200).optional()
}).refine((value) => Boolean(value.milliseconds ?? value.text), "Wait requires milliseconds or text");
const AssertStep = StepBase.extend({
  type: z.literal("assert"),
  urlContains: z.string().trim().min(1).max(200).optional(),
  titleContains: z.string().trim().min(1).max(200).optional(),
  textContains: z.string().trim().min(1).max(500).optional()
}).refine((value) => Boolean(value.urlContains ?? value.titleContains ?? value.textContains), "Assert requires urlContains, titleContains, or textContains");

export const BrowserStepSchema = z.discriminatedUnion("type", [NavigateStep, SnapshotStep, ScreenshotStep, ClickStep, TypeStep, WaitStep, AssertStep]);

const MissionPlanSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  phases: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    purpose: z.string().trim().min(1).max(1000)
  }).strict()).min(1)
}).strict();

export const BrowserMissionSchema = z.object({
  objective: z.string().trim().min(1).max(5000),
  instructions: z.string().trim().max(20000).default(""),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(1000)).min(1).max(100),
  plan: MissionPlanSchema.optional(),
  steps: z.array(BrowserStepSchema).min(1),
  maxDurationMs: z.number().int().min(1000),
  maxInteractions: z.number().int().min(1)
}).strict();

export type BrowserMission = z.infer<typeof BrowserMissionSchema>;
export type BrowserStep = z.infer<typeof BrowserStepSchema>;
export type BrowserMissionPlan = z.infer<typeof MissionPlanSchema>;

const NavigationEvidence = z.object({ type: z.literal("navigation"), url: z.string().url(), title: z.string().max(500) }).strict();
const SnapshotEvidence = z.object({ type: z.literal("snapshot"), url: z.string().url(), text: z.string().max(20000) }).strict();
const ScreenshotEvidence = z.object({ type: z.literal("screenshot"), url: z.string().url(), mimeType: z.literal("image/jpeg"), data: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(2_000_000) }).strict();
const ActionEvidence = z.object({ type: z.literal("action"), action: z.string().min(1).max(500), url: z.string().url() }).strict();

export const BrowserEvidenceSchema = z.discriminatedUnion("type", [
  NavigationEvidence, SnapshotEvidence, ScreenshotEvidence, ActionEvidence
]);

const FindingSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  kind: z.enum(["assertion", "unverified", "navigation", "browser", "timeout", "interaction_budget", "target_blocked", "cancelled"]),
  message: z.string().min(1).max(2000),
  stepIndex: z.number().int().min(0).optional(),
  probableCause: z.string().max(2000).optional(),
  recommendedAction: z.string().max(2000).optional()
}).strict();

export const BrowserMissionResultSchema = z.object({
  ok: z.literal(true),
  status: z.enum(["PASS", "FAIL", "BLOCKED", "UNPROVEN"]),
  objective: z.string().max(5000),
  acceptanceCriteria: z.array(z.string().min(1).max(1000)).min(1).max(100),
  finalUrl: z.string().url().nullable(),
  title: z.string().max(500),
  evidence: z.array(BrowserEvidenceSchema),
  findings: z.array(FindingSchema),
  diagnosis: z.object({
    summary: z.string().max(2000),
    confidence: z.enum(["low", "medium", "high"]),
    nextAction: z.string().max(2000)
  }).strict(),
  budget: z.object({
    maxDurationMs: z.number().int().min(1000),
    maxInteractions: z.number().int().min(1),
    interactionsUsed: z.number().int().min(0),
    durationMs: z.number().int().min(0),
    exhausted: z.enum(["time", "interactions"]).optional()
  }).strict()
}).strict();

export type BrowserEvidence = z.infer<typeof BrowserEvidenceSchema>;
export type BrowserMissionResult = z.infer<typeof BrowserMissionResultSchema>;
export type BrowserFinding = z.infer<typeof FindingSchema>;
