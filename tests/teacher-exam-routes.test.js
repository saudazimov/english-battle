const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeacherExamRoutes = require("../src/routes/teacherExamRoutes");

test("teacher exam registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const sanitizeText = () => {};
  const logAudit = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    create: factory("create"),
    list: factory("list"),
    detail: factory("detail"),
    remove: factory("remove"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerTeacherExamRoutes({
    app,
    pool,
    sanitizeText,
    logAudit,
    routeFactories,
  });

  assert.deepEqual(mounted, [
    "create-router",
    "list-router",
    "detail-router",
    "remove-router",
  ]);
  assert.deepEqual(calls, [
    ["create", { pool, sanitizeText, logAudit }],
    ["list", { pool }],
    ["detail", { pool }],
    ["remove", { pool, logAudit }],
  ]);
});
