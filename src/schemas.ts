import { z } from "zod";

const ProjectId = z.string().trim().min(1).max(100).regex(
  /^[A-Za-z0-9._:-]+$/,
  "Project ID contains unsupported characters"
);

const TaskId = z.string().trim().min(1).max(100).regex(
  /^[A-Za-z0-9._:-]+$/,
  "Task ID contains unsupported characters"
);

const RunId = z.string().trim().min(1).max(100).regex(
  /^[A-Za-z0-9._:-]+$/,
  "Run ID contains unsupported characters"
);

export const GetAppStatusSchema = z.object({}).strict();

export const ListProjectsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().max(500).optional()
}).strict();

export const CreateTaskSchema = z.object({
  projectId: ProjectId,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal")
}).strict();

export const GetTaskSchema = z.object({
  taskId: TaskId
}).strict();

export const RunSmokeTestsSchema = z.object({
  projectId: ProjectId,
  suite: z.enum(["critical", "api", "frontend", "full"]).default("critical")
}).strict();

export const GetTestResultsSchema = z.object({
  runId: RunId
}).strict();

export const SearchDocsSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(20).default(10)
}).strict();

export type ListProjectsInput = z.infer<typeof ListProjectsSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type GetTaskInput = z.infer<typeof GetTaskSchema>;
export type RunSmokeTestsInput = z.infer<typeof RunSmokeTestsSchema>;
export type GetTestResultsInput = z.infer<typeof GetTestResultsSchema>;
export type SearchDocsInput = z.infer<typeof SearchDocsSchema>;
