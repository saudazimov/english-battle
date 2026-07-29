const test = require("node:test");
const assert = require("node:assert/strict");
const registerParentFamilyRoutes = require("../src/routes/parentFamilyRoutes");

test("parent family registrar preserves order and dependencies", () => {
  const calls = [];
  const mounted = [];
  const dependencies = {
    pool: {},
    parentCode: {},
    parentLinkBlocked: () => {},
    parentLinkNoteFail: () => {},
    parentLinkNoteOk: () => {},
    parentLeagueName: () => {},
    activityLabel: () => {},
  };
  const factory = (name) => (receivedDependencies) => {
    calls.push([name, receivedDependencies]);
    return `${name}-router`;
  };
  const routeFactories = {
    link: factory("link"),
    childrenList: factory("children-list"),
    childDetail: factory("child-detail"),
    childUnlink: factory("child-unlink"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerParentFamilyRoutes({ app, ...dependencies, routeFactories });

  assert.deepEqual(mounted, [
    "link-router",
    "children-list-router",
    "child-detail-router",
    "child-unlink-router",
  ]);
  assert.deepEqual(calls, [
    ["link", {
      pool: dependencies.pool,
      parentCode: dependencies.parentCode,
      parentLinkBlocked: dependencies.parentLinkBlocked,
      parentLinkNoteFail: dependencies.parentLinkNoteFail,
      parentLinkNoteOk: dependencies.parentLinkNoteOk,
    }],
    ["children-list", {
      pool: dependencies.pool,
      parentLeagueName: dependencies.parentLeagueName,
      activityLabel: dependencies.activityLabel,
    }],
    ["child-detail", {
      pool: dependencies.pool,
      parentLeagueName: dependencies.parentLeagueName,
      activityLabel: dependencies.activityLabel,
    }],
    ["child-unlink", { pool: dependencies.pool }],
  ]);
});
