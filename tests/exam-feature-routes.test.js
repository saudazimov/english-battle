const test = require("node:test");
const assert = require("node:assert/strict");

const examFeatureRoutes = require("../src/routes/examFeatureRoutes");

test("exam feature routes preserve phased dependencies", () => {
  const calls = [];
  const app = {};
  const pool = {};
  const getNextLevel = () => {};
  const randomUUID = () => {};
  const sanitizeText = () => {};
  const logAudit = () => {};
  const startGradeAttempt = () => {};
  const submitGradeAttempt = () => {};
  const routes = {
    registerLevel(dependencies) {
      calls.push(["level", dependencies]);
    },
    registerTeacher(dependencies) {
      calls.push(["teacher", dependencies]);
    },
    registerStudent(dependencies) {
      calls.push(["student", dependencies]);
    },
  };

  examFeatureRoutes.registerLevelRoutes({
    app,
    pool,
    getNextLevel,
    randomUUID,
    routes,
  });
  examFeatureRoutes.registerTeacherRoutes({
    app,
    pool,
    sanitizeText,
    logAudit,
    routes,
  });
  examFeatureRoutes.registerStudentRoutes({
    app,
    pool,
    startGradeAttempt,
    submitGradeAttempt,
    routes,
  });

  assert.deepEqual(calls, [
    ["level", { app, pool, getNextLevel, randomUUID }],
    ["teacher", { app, pool, sanitizeText, logAudit }],
    ["student", { app, pool, startGradeAttempt, submitGradeAttempt }],
  ]);
});
