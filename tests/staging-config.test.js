"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function parseTemplate(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

test("staging environment is isolated and contains no committed secrets", () => {
  const values = parseTemplate(read(".env.staging.example"));
  const requiredKeys = [
    "PORT", "NODE_ENV", "TRUST_PROXY_HOPS", "CLIENT_ORIGIN",
    "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME", "DB_SSL",
    "JWT_SECRET", "PARENT_CODE_PEPPER", "SCHOOL_INVITE_PEPPER",
    "ADMIN_PASSWORD", "ADMIN_TOTP_SECRET", "ESKIZ_EMAIL", "ESKIZ_PASSWORD",
    "PAYME_MERCHANT_ID", "PAYME_KEY", "METRICS_TOKEN", "AI_REPORTS_ENABLED",
  ];

  for (const key of requiredKeys) assert.ok(values.has(key), `Missing ${key}`);
  assert.equal(values.get("PORT"), "3100");
  assert.equal(values.get("NODE_ENV"), "production");
  assert.equal(values.get("DB_NAME"), "english_battle_staging");
  assert.equal(values.get("DB_USER"), "eb_staging_user");
  assert.match(values.get("CLIENT_ORIGIN"), /^https:\/\/staging\./);
  assert.equal(values.get("AI_REPORTS_ENABLED"), "false");

  const secretKeys = [
    "DB_PASSWORD", "JWT_SECRET", "PARENT_CODE_PEPPER", "SCHOOL_INVITE_PEPPER",
    "ADMIN_PASSWORD", "ADMIN_TOTP_SECRET", "ESKIZ_EMAIL", "ESKIZ_PASSWORD",
    "PAYME_MERCHANT_ID", "PAYME_KEY", "PAYME_TEST_KEY", "METRICS_TOKEN",
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
  ];
  for (const key of secretKeys) assert.equal(values.get(key), "", `${key} must be blank`);
});

test("staging PM2 profile uses a separate production-hardened process", () => {
  const config = require("../deploy/ecosystem.staging.config");
  assert.equal(config.apps.length, 1);
  const app = config.apps[0];

  assert.equal(app.name, "english-battle-staging");
  assert.equal(app.instances, 1);
  assert.equal(app.exec_mode, "fork");
  assert.equal(app.env.NODE_ENV, "production");
  assert.equal(app.env.PORT, "3100");
  assert.match(app.error_file, /staging/);
  assert.match(app.out_file, /staging/);
});

test("environment templates and staging guide preserve isolation rules", () => {
  const defaultTemplate = parseTemplate(read(".env.example"));
  assert.equal(defaultTemplate.get("TRUST_PROXY_HOPS"), "0");
  assert.equal(defaultTemplate.get("DB_SSL"), "false");
  assert.ok(defaultTemplate.has("SCHOOL_INVITE_PEPPER"));

  const gitignore = read(".gitignore");
  assert.match(gitignore, /^!\.env\.staging\.example$/m);

  const guide = read("deploy/STAGING.md");
  assert.match(guide, /Production databasega qarshi E2E yoki/);
  assert.match(guide, /npm run test:full.*bajarish taqiqlanadi/s);
  assert.match(guide, /DB_NAME=english_battle_staging/);
  assert.match(guide, /NODE_ENV=production/);
});
