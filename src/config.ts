import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MCP_BEARER_TOKEN: z.string().min(32),
  APP_API_BASE_URL: z.string().url().refine(
    (value) => value.startsWith("https://"),
    "APP_API_BASE_URL must use HTTPS"
  ),
  APP_API_TOKEN: z.string().min(1),
  APP_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  BROWSER_WORKER_URL: z.string().url().refine(
    (value) => value.startsWith("https://"),
    "BROWSER_WORKER_URL must use HTTPS"
  ).optional(),
  BROWSER_WORKER_TOKEN: z.string().min(32).optional()
}).superRefine((value, ctx) => {
  if (Boolean(value.BROWSER_WORKER_URL) !== Boolean(value.BROWSER_WORKER_TOKEN)) {
    ctx.addIssue({
      code: "custom",
      message: "BROWSER_WORKER_URL and BROWSER_WORKER_TOKEN must be configured together",
      path: ["BROWSER_WORKER_URL"]
    });
  }
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new Error(JSON.stringify({
      error: "INVALID_CONFIGURATION",
      details: result.error.flatten()
    }));
  }
  return result.data;
}
