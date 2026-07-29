const test = require("node:test");
const assert = require("node:assert/strict");
const registerStudentExamRoutes = require("../src/routes/studentExamRoutes");

test("student exam registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const pool = {};
  const startGradeAttempt = () => {};
  const submitGradeAttempt = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    list: factory("list"),
    start: factory("start"),
    answer: factory("answer"),
    submit: factory("submit"),
    result: factory("result"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerStudentExamRoutes({
    app,
    pool,
    startGradeAttempt,
    submitGradeAttempt,
    routeFactories,
  });

  assert.deepEqual(mounted, [
    "list-router",
    "start-router",
    "answer-router",
    "submit-router",
    "result-router",
  ]);
  assert.deepEqual(calls, [
    ["list", { pool }],
    ["start", { pool, gradeAttempt: startGradeAttempt }],
    ["answer", { pool }],
    ["submit", { pool, gradeAttempt: submitGradeAttempt }],
    ["result", { pool }],
  ]);
});
