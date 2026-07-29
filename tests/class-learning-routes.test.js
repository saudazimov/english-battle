const test = require("node:test");
const assert = require("node:assert/strict");

const registerClassLearningRoutes = require("../src/routes/classLearningRoutes");

test("class learning routes preserve mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };
  const pool = {};
  const sanitizeText = () => {};
  const validMeetingUrl = () => {};
  const ownedActiveClass = () => {};
  const activeClassMembership = () => {};
  const io = {};
  const routeFactories = {
    attendance(dependencies) {
      calls.push(["attendance", dependencies]);
      return "attendance-router";
    },
    lessons(dependencies) {
      calls.push(["lessons", dependencies]);
      return "lessons-router";
    },
  };

  registerClassLearningRoutes({
    app,
    pool,
    sanitizeText,
    validMeetingUrl,
    ownedActiveClass,
    activeClassMembership,
    io,
    routeFactories,
  });

  assert.deepEqual(mounted, ["attendance-router", "lessons-router"]);
  assert.deepEqual(calls, [
    ["attendance", {
      pool,
      sanitizeText,
      ownedActiveClass,
      activeClassMembership,
      io,
    }],
    ["lessons", {
      pool,
      sanitizeText,
      validMeetingUrl,
      ownedActiveClass,
      activeClassMembership,
      io,
    }],
  ]);
});
