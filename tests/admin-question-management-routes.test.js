const test = require("node:test");
const assert = require("node:assert/strict");
const registerAdminQuestionManagementRoutes = require(
  "../src/routes/adminQuestionManagementRoutes"
);

test("admin question management registrar preserves order and dependencies", () => {
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
    create: factory("create"),
    remove: factory("remove"),
    update: factory("update"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerAdminQuestionManagementRoutes({ app, pool, logAudit, routeFactories });

  assert.deepEqual(mounted, [
    "list-router",
    "create-router",
    "remove-router",
    "update-router",
  ]);
  assert.deepEqual(calls, [
    ["list", { pool }],
    ["create", { pool, logAudit }],
    ["remove", { pool, logAudit }],
    ["update", { pool, logAudit }],
  ]);
});
