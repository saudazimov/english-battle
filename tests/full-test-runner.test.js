"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { collectTestFiles } = require("../scripts/run-full-tests");

test("full test runner discovers every test in deterministic order", () => {
  const testsRoot = path.resolve(__dirname);
  const files = collectTestFiles(testsRoot);
  const sortedFiles = [...files].sort((left, right) => left.localeCompare(right, "en"));

  assert.deepEqual(files, sortedFiles);
  assert.ok(files.includes(__filename));
  assert.ok(files.includes(path.join(testsRoot, "security-regression.test.js")));
  assert.ok(files.includes(path.join(testsRoot, "e2e-api.test.js")));
  assert.ok(files.every((file) => file.endsWith(".test.js")));
});
