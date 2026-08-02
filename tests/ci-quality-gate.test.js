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
const packageLock = JSON.parse(fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"));
const dependabot = fs.readFileSync(path.join(projectRoot, ".github/dependabot.yml"), "utf8");

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
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1[\s\S]*persist-credentials: false/);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4[\s\S]*node-version: "20"[\s\S]*cache: npm/);
  assert.doesNotMatch(workflow, /uses:\s+actions\/[^\s@]+@v\d+/);
});

test("quality workflow uses only an isolated PostgreSQL test database", () => {
  assert.match(workflow, /image: postgres:16-alpine/);
  assert.match(workflow, /POSTGRES_DB: english_battle_ci/);
  assert.match(workflow, /DB_NAME: english_battle_ci/);
  assert.match(workflow, /Apply migrations to isolated CI database[\s\S]*npm run migrate[\s\S]*NODE_ENV: production/);
  assert.doesNotMatch(workflow, /DATABASE_URL/);
});

test("quality workflow gates dependencies, contracts and the full suite", () => {
  assert.match(workflow, /run: npm run security:secrets/);
  assert.ok(workflow.indexOf("npm run security:secrets") < workflow.indexOf("npm ci"));
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run security:audit/);
  assert.match(workflow, /run: npm run test:production-contract/);
  assert.match(workflow, /run: npm run test:full/);
  assert.equal(packageJson.scripts["security:audit"], "npm audit --omit=dev --audit-level=high");
  assert.equal(packageJson.scripts["security:secrets"], "node scripts/scan-secrets.js");
  assert.match(packageJson.scripts["test:production-contract"], /production-environment\.test\.js/);
  assert.doesNotMatch(workflow, /\b(?:ssh|scp|rsync|pm2|git push)\b/);
});

test("supply-chain policy tracks npm and GitHub Actions updates", () => {
  assert.match(dependabot, /package-ecosystem: "npm"/);
  assert.match(dependabot, /package-ecosystem: "github-actions"/);
  assert.equal((dependabot.match(/interval: "weekly"/g) || []).length, 2);
  assert.equal((dependabot.match(/target-branch: "main"/g) || []).length, 2);
  assert.equal(packageLock.packages["node_modules/body-parser"].version, "2.3.0");
});
