const test = require("node:test");
const assert = require("node:assert/strict");
const registerSchoolTournamentManagementRoutes = require(
  "../src/routes/schoolTournamentManagementRoutes"
);

test("school tournament registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const getSchoolAdmin = () => {};
  const factory = (name) => (dependencies) => {
    calls.push([name, dependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    tournaments: factory("tournaments"),
    students: factory("students"),
    bracket: factory("bracket"),
    teamList: factory("team-list"),
    teamSave: factory("team-save"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerSchoolTournamentManagementRoutes({
    app,
    getSchoolAdmin,
    routeFactories,
  });

  assert.deepEqual(mounted, [
    "tournaments-router",
    "students-router",
    "bracket-router",
    "team-list-router",
    "team-save-router",
  ]);
  assert.deepEqual(calls, [
    ["tournaments", { getSchoolAdmin }],
    ["students", { getSchoolAdmin }],
    ["bracket", { getSchoolAdmin }],
    ["team-list", { getSchoolAdmin }],
    ["team-save", { getSchoolAdmin }],
  ]);
});
