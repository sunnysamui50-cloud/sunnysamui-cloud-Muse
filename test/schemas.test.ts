import test from "node:test";
import assert from "node:assert/strict";
import {
  CreateTaskSchema,
  GetAppStatusSchema,
  GetTaskSchema,
  GetTestResultsSchema,
  ListProjectsSchema,
  RunSmokeTestsSchema,
  SearchDocsSchema
} from "../src/schemas.js";

test("all seven schemas reject unexpected fields", () => {
  assert.equal(GetAppStatusSchema.safeParse({ unexpected: true }).success, false);
  assert.equal(ListProjectsSchema.safeParse({ unexpected: true }).success, false);
  assert.equal(
    CreateTaskSchema.safeParse({
      projectId: "p",
      title: "t",
      unexpected: true
    }).success,
    false
  );
  assert.equal(
    GetTaskSchema.safeParse({ taskId: "t", unexpected: true }).success,
    false
  );
  assert.equal(
    RunSmokeTestsSchema.safeParse({ projectId: "p", unexpected: true }).success,
    false
  );
  assert.equal(
    GetTestResultsSchema.safeParse({ runId: "r", unexpected: true }).success,
    false
  );
  assert.equal(
    SearchDocsSchema.safeParse({ query: "x", unexpected: true }).success,
    false
  );
});

test("bounded values are enforced", () => {
  assert.equal(ListProjectsSchema.safeParse({ limit: 101 }).success, false);
  assert.equal(SearchDocsSchema.safeParse({ query: "", limit: 10 }).success, false);
  assert.equal(
    CreateTaskSchema.safeParse({ projectId: "p", title: "" }).success,
    false
  );
});

test("valid inputs receive defaults", () => {
  assert.deepEqual(
    CreateTaskSchema.parse({
      projectId: "myvoice",
      title: "Check login"
    }),
    {
      projectId: "myvoice",
      title: "Check login",
      priority: "normal"
    }
  );

  assert.deepEqual(
    RunSmokeTestsSchema.parse({ projectId: "myvoice" }),
    {
      projectId: "myvoice",
      suite: "critical"
    }
  );
});
