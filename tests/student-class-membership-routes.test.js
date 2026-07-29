const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createStudentClassMembershipRoutes,
} = require("../src/routes/studentClassMembershipRoutes");

test("student class membership preserves phased mount order and dependencies", () => {
  const mounted = [];
  const calls = [];
  const app = { use(router) { mounted.push(router); } };
  const pool = {};
  const premium = {};
  const logAudit = () => {};
  const io = {};
  const activeClassMembership = () => {};
  const routeFactories = {
    join(dependencies) {
      calls.push(["join", dependencies]);
      return "join-router";
    },
    createViewing(dependencies) {
      calls.push(["viewing", dependencies]);
      return { listRouter: "list-router", rankingRouter: "ranking-router" };
    },
    leave(dependencies) {
      calls.push(["leave", dependencies]);
      return "leave-router";
    },
  };
  const routes = createStudentClassMembershipRoutes({
    pool,
    premium,
    logAudit,
    io,
    activeClassMembership,
    routeFactories,
  });

  routes.registerEntryRoutes(app);
  app.use("announcement-router");
  routes.registerPostAnnouncementRoutes(app);

  assert.deepEqual(mounted, [
    "join-router",
    "list-router",
    "announcement-router",
    "leave-router",
    "ranking-router",
  ]);
  assert.deepEqual(calls, [
    ["join", { pool, premium, logAudit, io }],
    ["viewing", { pool, activeClassMembership }],
    ["leave", { pool, activeClassMembership, io }],
  ]);
});
