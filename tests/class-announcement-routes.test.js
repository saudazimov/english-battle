const test = require("node:test");
const assert = require("node:assert/strict");
const registerClassAnnouncementRoutes = require(
  "../src/routes/classAnnouncementRoutes"
);

test("class announcement registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const sanitizeText = () => {};
  const ownedActiveClass = () => {};
  const activeClassMembership = () => {};
  const io = {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    teacherList: factory("teacher-list"),
    create: factory("create"),
    update: factory("update"),
    remove: factory("remove"),
    studentList: factory("student-list"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerClassAnnouncementRoutes({
    app,
    sanitizeText,
    ownedActiveClass,
    activeClassMembership,
    io,
    routeFactories,
  });

  assert.deepEqual(mounted, [
    "teacher-list-router",
    "create-router",
    "update-router",
    "remove-router",
    "student-list-router",
  ]);
  assert.deepEqual(calls, [
    ["teacher-list", { ownedActiveClass }],
    ["create", { sanitizeText, ownedActiveClass, io }],
    ["update", { sanitizeText, ownedActiveClass, io }],
    ["remove", { ownedActiveClass, io }],
    ["student-list", { activeClassMembership }],
  ]);
});
