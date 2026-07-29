const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeacherSettingsRoutes = require(
  "../src/routes/teacherSettingsRoutes"
);

test("teacher settings registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const sanitizeText = () => {};
  const validatePassword = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return name + "-router";
  };
  const routeFactories = {
    read: factory("read"),
    update: factory("update"),
    password: factory("password"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerTeacherSettingsRoutes({
    app,
    sanitizeText,
    validatePassword,
    routeFactories,
  });

  assert.deepEqual(mounted, [
    "read-router",
    "update-router",
    "password-router",
  ]);
  assert.deepEqual(calls, [
    ["read", undefined],
    ["update", { sanitizeText }],
    ["password", { validatePassword }],
  ]);
});
