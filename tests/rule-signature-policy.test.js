"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  isAllowedRuleSignature,
  isQuarantinedRuleSignature,
  quarantinedRuleSignatures,
} = require("../src/utils/ruleSignaturePolicy");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "migrations", "048_canonical_rule_signatures.sql"),
  "utf8"
).replace(/\s+/g, " ").trim();

test("canonical rule signature policy accepts only scoped, reviewed domains", () => {
  assert.equal(isAllowedRuleSignature("grammar.present_continuous.affirmative.plural_are"), true);
  assert.equal(isAllowedRuleSignature("unknown.present_continuous.affirmative"), false);
  assert.equal(isAllowedRuleSignature("Grammar Present Continuous"), false);
  assert.equal(isAllowedRuleSignature(`grammar.${"a".repeat(160)}`), false);
});

test("canonical rule signature policy rejects every quarantined signature", () => {
  const quarantined = quarantinedRuleSignatures();
  assert.ok(quarantined.length > 0);
  for (const signature of quarantined) {
    assert.equal(isQuarantinedRuleSignature(signature), true);
    assert.equal(isAllowedRuleSignature(signature), false);
  }
});

test("canonical rule signature migration enforces reviewed evidence atomically", () => {
  assert.match(migration, /^BEGIN;/i);
  assert.match(migration, /COMMIT;$/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS rule_signature VARCHAR\(160\)/i);
  assert.match(migration, /rule_signature_confidence >= 0 AND rule_signature_confidence <= 1/i);
  assert.match(migration, /rule_signature_reviewed = false OR \(/i);
  assert.match(migration, /rule_signature_confidence >= 0\.9/i);
  assert.match(migration, /WHERE rule_signature_reviewed = true AND diagnostic_eligible = true/i);
});
