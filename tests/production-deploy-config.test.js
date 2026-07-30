"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const productionPm2 = require("../deploy/ecosystem.config");
const { runProductionEnvironmentCheck } = require("../scripts/validate-production-env");

const projectRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8"));
}

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("production PM2 profile matches the single-instance runtime contract", () => {
  assert.equal(productionPm2.apps.length, 1);
  const app = productionPm2.apps[0];

  assert.equal(app.name, "english-battle");
  assert.equal(app.instances, 1);
  assert.equal(app.exec_mode, "fork");
  assert.equal(app.wait_ready, false);
  assert.ok(app.kill_timeout > 10000);
  assert.equal(app.env.NODE_ENV, "production");
  assert.equal(app.env.PORT, "3000");
  assert.equal(app.env.TRUST_PROXY_HOPS, "1");
  assert.match(app.error_file, /pm2-error\.log$/);
  assert.match(app.out_file, /pm2-out\.log$/);
});

test("production preflight always enables strict validation", () => {
  const calls = [];
  const logs = [];

  runProductionEnvironmentCheck({
    environment: { NODE_ENV: "development", SENTINEL: "kept" },
    validator: (environment) => calls.push(environment),
    logger: { log: (message) => logs.push(message) },
  });

  assert.deepEqual(calls, [{ NODE_ENV: "production", SENTINEL: "kept" }]);
  assert.deepEqual(logs, ["Production konfiguratsiyasi tekshirildi: OK"]);
  assert.equal(readJson("package.json").scripts["config:check:production"], "node scripts/validate-production-env.js");
});

test("production deploy guide enforces preflight, health gates and rollback", () => {
  const guide = read("deploy/DEPLOY.md");

  assert.doesNotMatch(guide, /001\.\.010/);
  assert.doesNotMatch(guide, /pm2 reload english-battle/);
  assert.match(guide, /npm run config:check:production/);
  assert.match(guide, /pm2 restart deploy\/ecosystem\.config\.js --update-env/);
  assert.match(guide, /curl --fail http:\/\/127\.0\.0\.1:3000\/health/);
  assert.match(guide, /curl --fail http:\/\/127\.0\.0\.1:3000\/ready/);
  assert.match(guide, /npm run test:full.*production databasega qarshi bajarmang/s);
  assert.match(guide, /Migrationlar forward-only/);
  assert.match(guide, /uploads\/resources/);
});
