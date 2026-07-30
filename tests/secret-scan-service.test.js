"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  findSecretsInText,
  formatFindings,
  isSecretFilePath,
  scanFiles,
  scanTrackedFiles,
} = require("../src/services/secretScanService");

test("secret filenames are blocked while documented env examples remain allowed", () => {
  for (const file of [".env", ".env.production", "private.pem", "id_rsa", "service-account.json"]) {
    assert.equal(isSecretFilePath(file), true, file);
  }
  assert.equal(isSecretFilePath(".env.example"), false);
  assert.equal(isSecretFilePath(".env.staging.example"), false);
});

test("secret findings never expose the matched value", () => {
  const rawSecret = ["ghp", "A".repeat(30)].join("_");
  const findings = findSecretsInText("src/example.js", `const token = "${rawSecret}";`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "GITHUB_TOKEN");
  assert.doesNotMatch(JSON.stringify(findings), new RegExp(rawSecret));
  assert.doesNotMatch(formatFindings(findings).join("\n"), new RegExp(rawSecret));
});

test("the exact database URL redaction fixture is allowlisted by fingerprint only", () => {
  const allowed = ["postgres://", "db-user", ":", "raw-db-password", "@db-host/database"].join("");
  const changed = ["postgres://", "db-user", ":", "different", "@db-host/database"].join("");
  assert.deepEqual(findSecretsInText("tests/http-bootstrap-service.test.js", allowed), []);
  assert.equal(findSecretsInText("tests/http-bootstrap-service.test.js", changed).length, 1);
});

test("scanFiles reports tracked secret filenames and safe fingerprints", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ilm-liga-secret-scan-"));
  try {
    await fs.writeFile(path.join(root, "safe.js"), "module.exports = true;");
    await fs.writeFile(path.join(root, ".env.production"), "DB_PASSWORD=must-not-be-logged");
    const findings = await scanFiles({
      projectRoot: root,
      files: ["safe.js", ".env.production"],
    });
    assert.deepEqual(findings, [{
      file: ".env.production",
      rule: "TRACKED_SECRET_FILE",
      line: 1,
      fingerprint: "filename",
    }]);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.match(path.basename(root), /^ilm-liga-secret-scan-/);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("current tracked repository passes the secret policy", async () => {
  const findings = await scanTrackedFiles({ projectRoot: path.resolve(__dirname, "..") });
  assert.deepEqual(findings, []);
});
