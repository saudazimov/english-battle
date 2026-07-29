const test = require("node:test");
const assert = require("node:assert/strict");

const registerParentRoutes = require("../src/routes/parentRoutes");

test("parent routes preserve student-connection-before-family order", () => {
  const calls = [];
  const dependencies = {
    app: {
      use(router) {
        calls.push(["mount", router]);
      },
    },
    pool: {},
    assignNewParentCode() {},
    maskParentPhone() {},
    parentCode: {},
    parentLinkBlocked() {},
    parentLinkNoteFail() {},
    parentLinkNoteOk() {},
    parentLeagueName() {},
    activityLabel() {},
  };
  const routes = {
    createStudentConnection(receivedDependencies) {
      calls.push(["student-connection", receivedDependencies]);
      return "student-connection-router";
    },
    registerFamily(receivedDependencies) {
      calls.push(["family", receivedDependencies]);
    },
  };

  registerParentRoutes({ ...dependencies, routes });

  assert.deepEqual(calls, [
    ["student-connection", {
      pool: dependencies.pool,
      assignNewParentCode: dependencies.assignNewParentCode,
      maskParentPhone: dependencies.maskParentPhone,
    }],
    ["mount", "student-connection-router"],
    ["family", {
      app: dependencies.app,
      pool: dependencies.pool,
      parentCode: dependencies.parentCode,
      parentLinkBlocked: dependencies.parentLinkBlocked,
      parentLinkNoteFail: dependencies.parentLinkNoteFail,
      parentLinkNoteOk: dependencies.parentLinkNoteOk,
      parentLeagueName: dependencies.parentLeagueName,
      activityLabel: dependencies.activityLabel,
    }],
  ]);
});
