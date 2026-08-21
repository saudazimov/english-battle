const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAdmin } = require("../auth");
const {
  createAdminStudentProvisioningService,
  createLogin,
  createPassword,
} = require("../src/services/adminStudentProvisioningService");
const adminStudentProvisioningRoutes = require("../src/routes/adminStudentProvisioningRoutes");

test("generated student credentials are human-friendly and valid", () => {
  assert.match(createLogin(), /^IL-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  assert.match(createPassword(), /^A.{9}7a$/);
});

test("student provisioning validates rows before opening a transaction", async () => {
  const service = createAdminStudentProvisioningService({
    pool: { connect: assert.fail },
    bcryptImpl: { hash: assert.fail },
  });
  const result = await service.provision([{ ism: "Ali", familiya: "", maktab: "1-maktab", sinf: "7-A" }]);
  assert.equal(result.status, "invalid");
  assert.equal(result.errors.length, 1);
});

test("student provisioning creates only student accounts in one transaction", async () => {
  const calls = [];
  let nextId = 10;
  const client = {
    async query(sql, params) {
      calls.push([sql, params]);
      if (/INSERT INTO users/.test(sql)) return { rows: [{ id: nextId++ }] };
      return { rows: [] };
    },
    release() { calls.push(["RELEASE"]); },
  };
  const service = createAdminStudentProvisioningService({
    pool: { async connect() { return client; } },
    bcryptImpl: { async hash(password, rounds) { assert.equal(rounds, 10); return `hash:${password}`; } },
  });
  const result = await service.provision([
    { ism: "Ali", familiya: "Valiyev", maktab: "1-maktab", sinf: "7-A" },
    { first_name: "Lola", last_name: "Karimova", school: "1-maktab", class_name: "7-A" },
  ]);

  assert.equal(result.status, "created");
  assert.equal(result.credentials.length, 2);
  assert.match(result.credentials[0].login, /^IL-/);
  assert.equal(calls[0][0], "BEGIN");
  assert.match(calls[1][0], /phone, password, role, username, school, class_name/);
  assert.match(calls[1][0], /NULL,\$3,'student'/);
  assert.equal(calls.at(-2)[0], "COMMIT");
  assert.equal(calls.at(-1)[0], "RELEASE");
});

test("student provisioning routes remain admin-only", () => {
  const router = adminStudentProvisioningRoutes({ pool: {}, logAudit() {} });
  const routes = router.stack.filter((layer) => layer.route).map((layer) => layer.route);
  assert.deepEqual(routes.map((route) => route.path), [
    "/admin/students/provision",
    "/admin/students/:id/reset-password",
  ]);
  for (const route of routes) assert.equal(route.stack[0].handle, requireAdmin);
});
