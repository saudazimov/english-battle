const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendListController } = require("../src/controllers/friendListController");

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

test("friend list preserves the query, authenticated user and online mapping", async () => {
  const rows = [
    { id: 7, first_name: "Ali" },
    { id: 9, first_name: "Vali" },
  ];
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows };
    },
  };
  const onlineUsers = { "7": "socket-7" };
  const controller = createFriendListController({ pool, onlineUsers });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture
       FROM friendships f
       JOIN users u ON (u.id = f.requester_id OR u.id = f.receiver_id)
       WHERE (f.requester_id = $1 OR f.receiver_id = $1)
         AND f.status = 'accepted'
         AND u.id != $1
       ORDER BY u.rating DESC`
  );
  assert.deepEqual(queries[0].params, [42]);
  assert.deepEqual(res.body, {
    friends: [
      { id: 7, first_name: "Ali", isOnline: true },
      { id: 9, first_name: "Vali", isOnline: false },
    ],
  });
});

test("friend list observes later mutations to the shared online-users object", async () => {
  const pool = {
    async query() {
      return { rows: [{ id: 7, first_name: "Ali" }] };
    },
  };
  const onlineUsers = {};
  const controller = createFriendListController({ pool, onlineUsers });
  onlineUsers["7"] = "new-socket";
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: {} }, res);

  assert.equal(res.body.friends[0].isOnline, true);
});

test("friend list preserves the existing safe error response", async () => {
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
  const controller = createFriendListController({ pool, onlineUsers: {}, logger });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Do'stlar xatosi:", "database unavailable"]]);
});
