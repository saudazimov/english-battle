const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeacherClassManagementRoutes = require(
  "../src/routes/teacherClassManagementRoutes"
);

test("teacher class management registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const sanitizeText = () => {};
  const logAudit = () => {};
  const factory = (name) => (...args) => {
    calls.push([name, args]);
    return `${name}-router`;
  };
  const routeFactories = {
    create: factory("create"),
    update: factory("update"),
    archive: factory("archive"),
    list: factory("list"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerTeacherClassManagementRoutes({
    app,
    sanitizeText,
    logAudit,
    routeFactories,
  });

  assert.deepEqual(mounted, [
    "create-router",
    "update-router",
    "archive-router",
    "list-router",
  ]);
  assert.deepEqual(calls, [
    ["create", [{ sanitizeText, logAudit }]],
    ["update", [{ sanitizeText, logAudit }]],
    ["archive", [{ logAudit }]],
    ["list", []],
  ]);
});
