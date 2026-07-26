const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendSearchController } = require("../src/controllers/friendSearchController");

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

test("friend search preserves the empty-query response without querying the database", async () => {
  let queryCount = 0;
  const pool = {
    async query() {
      queryCount += 1;
      return { rows: [] };
    },
  };
  const controller = createFriendSearchController({ pool });
  const res = createResponse();

  await controller.search({ query: { q: "   " }, user: { id: 7 } }, res);

  assert.equal(queryCount, 0);
  assert.deepEqual(res.body, { results: [] });
});

test("friend search preserves the query and relation status mapping", async () => {
  const rows = [
    { id: 1, first_name: "Ali", relation_status: "accepted" },
    { id: 2, first_name: "Vali", relation_status: "pending" },
    { id: 3, first_name: "Sami", relation_status: null },
  ];
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows };
    },
  };
  const controller = createFriendSearchController({ pool });
  const res = createResponse();

  await controller.search({ query: { q: " Ali " }, user: { id: 42 } }, res);

  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, ["%Ali%", 42]);
  assert.match(queries[0].sql, /AND COALESCE\(u\.is_banned, false\) = false/);
  assert.match(queries[0].sql, /ORDER BY u\.rating DESC, u\.id ASC\s+LIMIT 20/);
  assert.deepEqual(res.body, {
    results: [
      { id: 1, first_name: "Ali", friendStatus: "friend" },
      { id: 2, first_name: "Vali", friendStatus: "pending" },
      { id: 3, first_name: "Sami", friendStatus: "none" },
    ],
  });
});

test("friend search preserves the existing safe error response", async () => {
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
  const controller = createFriendSearchController({ pool, logger });
  const res = createResponse();

  await controller.search({ query: { q: "ali" }, user: { id: 7 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Do'st qidirish xatosi:", "database unavailable"]]);
});
