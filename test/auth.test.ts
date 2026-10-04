import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorized } from "../src/auth.js";

const token = "a".repeat(32);

test("accepts a valid bearer token", () => {
  assert.equal(
    isAuthorized({ authorization: `Bearer ${token}` }, token),
    true
  );
});

test("rejects a missing bearer token", () => {
  assert.equal(isAuthorized({}, token), false);
});

test("rejects a malformed authorization header", () => {
  assert.equal(isAuthorized({ authorization: token }, token), false);
});

test("rejects an incorrect bearer token", () => {
  assert.equal(
    isAuthorized({ authorization: `Bearer ${"b".repeat(32)}` }, token),
    false
  );
});
