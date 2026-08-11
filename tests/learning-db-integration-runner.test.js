"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const packageJson = require("../package.json");
const {
  integrationTest,
  integrationTimeoutMs,
  runLearningDbIntegration,
  validateIntegrationEnvironment,
} = require("../scripts/run-learning-db-integration");

test("learning DB npm command uses the cross-platform Node runner", () => {
  assert.equal(packageJson.scripts["test:learning-db"],"node scripts/run-learning-db-integration.js");
  assert.equal(path.basename(integrationTest),"learning-review-postgres.integration.test.js");
});

test("learning DB runner opts in only its child and preserves a successful exit code", () => {
  let captured;
  const originalOptIn = process.env.RUN_DB_INTEGRATION;
  const status = runLearningDbIntegration({
    env: { SAFE_PARENT_VALUE: "preserved" },
    spawn(executable,args,options) {
      captured = { executable,args,options };
      return { status: 0 };
    },
  });

  assert.equal(status,0);
  assert.equal(captured.executable,process.execPath);
  assert.deepEqual(captured.args,["--test",integrationTest]);
  assert.equal(captured.options.env.RUN_DB_INTEGRATION,"true");
  assert.equal(captured.options.env.SAFE_PARENT_VALUE,"preserved");
  assert.equal(captured.options.stdio,"inherit");
  assert.equal(captured.options.timeout,30000);
  assert.equal(captured.options.timeout,integrationTimeoutMs);
  assert.equal(captured.options.killSignal,"SIGTERM");
  assert.equal(captured.options.windowsHide,true);
  assert.equal(process.env.RUN_DB_INTEGRATION,originalOptIn);
});

test("learning DB runner converts launch errors and missing statuses to failure", () => {
  assert.equal(runLearningDbIntegration({
    spawn() { return { error: new Error("spawn failed"),status: null }; },
    logger: { error() {} },
  }),1);
  assert.equal(runLearningDbIntegration({
    spawn() { return { status: null }; },
  }),1);
});

test("learning DB runner treats a bounded child timeout as failure", () => {
  const errors = [];
  const timeoutError = Object.assign(new Error("test timed out"),{ code: "ETIMEDOUT" });
  const status = runLearningDbIntegration({
    spawn() { return { error: timeoutError,status: null,signal: "SIGTERM" }; },
    logger: { error(...args) { errors.push(args); } },
  });

  assert.equal(status,1);
  assert.equal(errors.length,1);
  assert.equal(errors[0][1],timeoutError);
});

test("learning DB runner blocks production and requires explicit approval for remote databases", () => {
  assert.throws(
    () => validateIntegrationEnvironment({ NODE_ENV: "production",DB_HOST: "127.0.0.1" }),
    /production muhitida ishlamaydi/
  );
  assert.throws(
    () => validateIntegrationEnvironment({ NODE_ENV: "test",DB_HOST: "db.example.com" }),
    /ALLOW_NONLOCAL_DB_INTEGRATION=true/
  );
  assert.doesNotThrow(() => validateIntegrationEnvironment({
    NODE_ENV: "test",DB_HOST: "db.example.com",ALLOW_NONLOCAL_DB_INTEGRATION: "true",
  }));
});
