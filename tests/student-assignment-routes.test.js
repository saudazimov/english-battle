const test = require("node:test");
const assert = require("node:assert/strict");
const registerStudentAssignmentRoutes = require(
  "../src/routes/studentAssignmentRoutes"
);

test("student assignment registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    list: factory("list"),
    start: factory("start"),
    submit: factory("submit"),
    review: factory("review"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerStudentAssignmentRoutes({ app, pool, routeFactories });

  assert.deepEqual(mounted, [
    "list-router",
    "start-router",
    "submit-router",
    "review-router",
  ]);
  assert.deepEqual(calls, [
    ["list", { pool }],
    ["start", { pool }],
    ["submit", { pool }],
    ["review", { pool }],
  ]);
});
