const test = require("node:test");
const assert = require("node:assert/strict");
const registerAdminMessageReviewRoutes = require(
  "../src/routes/adminMessageReviewRoutes"
);

test("admin message review registrar preserves order and factory arguments", () => {
  const calls = [];
  const mounted = [];
  const factory = (name) => (...args) => {
    calls.push([name, args]);
    return `${name}-router`;
  };
  const routeFactories = {
    userMessages: factory("user-messages"),
    roomMessages: factory("room-messages"),
  };
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerAdminMessageReviewRoutes({ app, routeFactories });

  assert.deepEqual(mounted, ["user-messages-router", "room-messages-router"]);
  assert.deepEqual(calls, [
    ["user-messages", []],
    ["room-messages", []],
  ]);
});
