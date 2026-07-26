const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendRequestsController } = require("../src/controllers/friendRequestsController");

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

test("friend requests preserves the authenticated-user query and response", async () => {
  const rows = [{ friendship_id: 4, id: 9, first_name: "Ali" }];
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows };
    },
  };
  const controller = createFriendRequestsController({ pool });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    `SELECT f.id AS friendship_id, u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.receiver_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`
  );
  assert.deepEqual(queries[0].params, [42]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { requests: rows });
});

test("friend requests preserves the existing safe error response", async () => {
  const logged = [];
  const pool = {
    async query() {
      throw new Error("database unavailable");
    },
  };
  const logger = {
    error(...args) {
      logged.push(args);
    },
  };
  const controller = createFriendRequestsController({ pool, logger });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["So'rovlar xatosi:", "database unavailable"]]);
});
