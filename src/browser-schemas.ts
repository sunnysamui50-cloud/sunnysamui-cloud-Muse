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

export const BrowserStepSchema = z.discriminatedUnion("type", [NavigateStep, SnapshotStep, ScreenshotStep, ClickStep, TypeStep, WaitStep]);
export const BrowserMissionSchema = z.object({
  steps: z.array(BrowserStepSchema).min(1).max(12),
  maxDurationMs: z.number().int().min(5000).max(90000).default(60000)
}).strict().refine(
  (mission) => mission.steps.filter((step) => step.type === "screenshot").length <= 3,
  "Mission may request at most three screenshots"
);
export type BrowserMission = z.infer<typeof BrowserMissionSchema>;
export type BrowserStep = z.infer<typeof BrowserStepSchema>;

const NavigationEvidence = z.object({ type: z.literal("navigation"), url: z.string().url(), title: z.string().max(500) }).strict();
const SnapshotEvidence = z.object({ type: z.literal("snapshot"), url: z.string().url(), text: z.string().max(20000) }).strict();
const ScreenshotEvidence = z.object({ type: z.literal("screenshot"), url: z.string().url(), mimeType: z.literal("image/jpeg"), data: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(2_000_000) }).strict();
const ActionEvidence = z.object({ type: z.literal("action"), action: z.string().min(1).max(500), url: z.string().url() }).strict();

export const BrowserEvidenceSchema = z.discriminatedUnion("type", [
  NavigationEvidence, SnapshotEvidence, ScreenshotEvidence, ActionEvidence
]);

export const BrowserMissionResultSchema = z.object({
  ok: z.literal(true),
  finalUrl: z.string().url(),
  title: z.string().max(500),
  evidence: z.array(BrowserEvidenceSchema).max(12)
}).strict();
