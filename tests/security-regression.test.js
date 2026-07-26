const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

test("backend JavaScript files pass Node syntax validation", () => {
  for (const file of ["server.js", "auth.js", "payme.js", "premium.js"]) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test("critical browser scripts are valid JavaScript", () => {
  for (const file of ["public/auth-common.js", "public/auth-register.js"]) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
  const files = [
    "public/teacher-settings.html",
    "public/teacher-messages.html",
    "public/lobby.html",
    "public/student-class-assignments.html",
    "public/admin.html",
  ];
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    for (const [index, match] of scripts.entries()) {
      if (!match[1].trim()) continue;
      assert.doesNotThrow(() => new Function(match[1]), `${file}, inline script ${index + 1}`);
    }
  }
});

test("invite codes normalize consistently and use unambiguous alphabet", () => {
  process.env.SCHOOL_INVITE_PEPPER = "test-school-pepper";
  process.env.PARENT_CODE_PEPPER = "test-parent-pepper";
  const school = require(path.join(root, "schoolInvite"));
  const parent = require(path.join(root, "parentCode"));

  const schoolCode = school.generateRawCode();
  const parentCode = parent.generateRawCode();
  assert.match(schoolCode, /^[A-HJ-NP-Z2-9]{10}$/);
  assert.match(parentCode, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(school.hashCode("ABCD-EFGH-23"), school.hashCode("abcd efgh 23"));
  assert.equal(school.formatForDisplay("ABCDEFGHIJ"), "ABCD-EFGH-IJ");
});

test("payment, session and upload integrity guards remain present", () => {
  const payme = fs.readFileSync(path.join(root, "payme.js"), "utf8");
  const premium = fs.readFileSync(path.join(root, "premium.js"), "utf8");
  const auth = fs.readFileSync(path.join(root, "auth.js"), "utf8");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

  assert.match(payme, /timingSafeEqual/);
  assert.match(payme, /SELECT \* FROM payments WHERE id = \$1 FOR UPDATE/);
  assert.match(payme, /revokeSubscriptionDays/);
  assert.match(premium, /ON CONFLICT \(user_id, plan\) WHERE status = 'active'/);
  assert.match(auth, /auth_version/);
  assert.match(server, /uploadedContentMatches/);
  assert.match(server, /FOR UPDATE OF uq/);
  assert.match(server, /new Set\(\["student", "teacher", "parent"\]\)/);
  assert.match(server, /requestedRole !== "school_admin"/);
});

test("all required security migrations exist", () => {
  for (const file of [
    "017_payment_integrity.sql",
    "018_auth_session_version.sql",
    "019_persistent_rate_limits.sql",
    "020_teacher_profile_fields.sql",
    "021_teacher_messages.sql",
  ]) {
    assert.ok(fs.existsSync(path.join(root, "migrations", file)), file);
  }
});
