"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(
  path.join(projectRoot, ".github/workflows/production-quality-gate.yml"),
  "utf8"
);
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));

test("quality workflow has minimal permissions and bounded concurrency", () => {
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /concurrency:[\s\S]*cancel-in-progress: true/);
  assert.match(workflow, /timeout-minutes: 30/);
  assert.doesNotMatch(workflow, /(?:contents|pull-requests|packages|id-token): write/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test("quality workflow runs on main pushes and pull requests", () => {
  assert.match(workflow, /push:[\s\S]*branches:[\s\S]*- main/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /actions\/checkout@v4[\s\S]*persist-credentials: false/);
  assert.match(workflow, /actions\/setup-node@v4[\s\S]*node-version: "20"[\s\S]*cache: npm/);
});

test("quality workflow uses only an isolated PostgreSQL test database", () => {
  assert.match(workflow, /image: postgres:16-alpine/);
  assert.match(workflow, /POSTGRES_DB: english_battle_ci/);
  assert.match(workflow, /DB_NAME: english_battle_ci/);
  assert.match(workflow, /Apply migrations to isolated CI database[\s\S]*npm run migrate[\s\S]*NODE_ENV: production/);
  assert.doesNotMatch(workflow, /DATABASE_URL/);
});

test("quality workflow gates dependencies, contracts and the full suite", () => {
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run security:audit/);
  assert.match(workflow, /run: npm run test:production-contract/);
  assert.match(workflow, /run: npm run test:full/);
  assert.equal(packageJson.scripts["security:audit"], "npm audit --omit=dev --audit-level=high");
  assert.match(packageJson.scripts["test:production-contract"], /production-environment\.test\.js/);
  assert.doesNotMatch(workflow, /\b(?:ssh|scp|rsync|pm2|git push)\b/);
});
