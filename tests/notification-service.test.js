const test = require("node:test");
const assert = require("node:assert/strict");

const { createNotificationService } = require("../src/services/notificationService");

const INSERT_SQL = "INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)";

test("notification service preserves parameterized insert and return value", async () => {
  const calls = [];
  const createNotification = createNotificationService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rowCount: 1 };
      },
    },
    logger: { error() { throw new Error("must not log"); } },
  });

  const result = await createNotification(44, "friend_request", "Yangi so'rov");

  assert.equal(result, undefined);
  assert.deepEqual(calls, [{
    sql: INSERT_SQL,
    params: [44, "friend_request", "Yangi so'rov"],
  }]);
});

test("notification service preserves safe database-error logging", async () => {
  const logs = [];
  const createNotification = createNotificationService({
    pool: {
      async query() {
        throw new Error("database unavailable");
      },
    },
    logger: {
      error(...args) {
        logs.push(args);
      },
    },
  });

  const result = await createNotification(7, "teacher_message", "Xabar");

  assert.equal(result, undefined);
  assert.deepEqual(logs, [[
    "Bildirishnoma yaratish xatosi:",
    "database unavailable",
  ]]);
});
