const test = require("node:test");
const assert = require("node:assert/strict");
const registerAdminUserManagementRoutes = require(
  "../src/routes/adminUserManagementRoutes"
);

test("admin user management registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const logAudit = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    list: factory("list"),
    role: factory("role"),
    ban: factory("ban"),
    update: factory("update"),
    detail: factory("detail"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerAdminUserManagementRoutes({ app, pool, logAudit, routeFactories });

  assert.deepEqual(mounted, [
    "list-router",
    "role-router",
    "ban-router",
    "update-router",
    "detail-router",
  ]);
  assert.deepEqual(calls, [
    ["list", { pool }],
    ["role", { pool, logAudit }],
    ["ban", { pool, logAudit }],
    ["update", { pool, logAudit }],
    ["detail", { pool }],
  ]);
});
