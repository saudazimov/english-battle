const test = require("node:test");
const assert = require("node:assert/strict");
const registerNotificationRoutes = require("../src/routes/notificationRoutes");
const {
  createNotificationClearController,
} = require("../src/controllers/notificationClearController");
const {
  createNotificationDeleteController,
} = require("../src/controllers/notificationDeleteController");
const {
  createNotificationListController,
} = require("../src/controllers/notificationListController");
const {
  createNotificationReadController,
} = require("../src/controllers/notificationReadController");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

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

test("notification collection actions ignore path userId and use the authenticated user", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push([sql.replace(/\s+/g, " ").trim(), params]);
      return { rows: [{ id: 1, is_read: false }] };
    },
  };
  const request = { user: { id: 7 }, params: { userId: "99" } };

  const listResponse = createResponse();
  await createNotificationListController({ pool }).list(request, listResponse);
  const readResponse = createResponse();
  await createNotificationReadController({ pool }).markAllRead(request, readResponse);
  const clearResponse = createResponse();
  await createNotificationClearController({ pool }).clearAll(request, clearResponse);

  assert.deepEqual(calls.map((call) => call[1]), [[7], [7], [7]]);
  assert.match(calls[0][0], /WHERE user_id = \$1/);
  assert.match(calls[1][0], /WHERE user_id = \$1 AND is_read = FALSE/);
  assert.match(calls[2][0], /WHERE user_id = \$1/);
  assert.deepEqual(listResponse.body, {
    notifications: [{ id: 1, is_read: false }],
    unread: 1,
  });
  assert.deepEqual(readResponse.body, { message: "O'qilgan deb belgilandi" });
  assert.deepEqual(clearResponse.body, { message: "Barcha xabarlar o'chirildi" });
});

test("notification delete scopes the requested id to the authenticated owner", async () => {
  const calls = [];
  const controller = createNotificationDeleteController({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        return { rows: [] };
      },
    },
  });
  const response = createResponse();

  await controller.remove(
    { user: { id: 7 }, params: { notifId: "42" } },
    response
  );

  assert.deepEqual(calls, [[
    "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
    [42, 7],
  ]]);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Topilmadi" });
});
