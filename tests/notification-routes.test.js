const test = require("node:test");
const assert = require("node:assert/strict");
const registerNotificationRoutes = require("../src/routes/notificationRoutes");

test("notification registrar preserves route and middleware order", () => {
  const mounted = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerNotificationRoutes({ app });

  assert.equal(mounted.length, 4);
  assert.deepEqual(
    mounted.map((router) => router.stack[0].route.path),
    [
      "/notifications/:userId",
      "/notifications/read/:userId",
      "/notifications/clear/:userId",
      "/notifications/:notifId",
    ]
  );
  assert.deepEqual(
    mounted.map((router) => Object.keys(router.stack[0].route.methods)),
    [["get"], ["post"], ["post"], ["delete"]]
  );
  assert.deepEqual(
    mounted.map((router) => router.stack[0].route.stack.length),
    [2, 2, 2, 2]
  );
});
