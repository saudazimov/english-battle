const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendWinsController } = require("../src/controllers/friendWinsController");

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

test("friend wins preserves the zero response when there are no accepted friends", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const controller = createFriendWinsController({ pool });
  const res = createResponse();

  await controller.getWins({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, [42]);
  assert.deepEqual(res.body, { wins: 0, total: 0 });
});

test("friend wins preserves both queries and numeric response", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (queries.length === 1) {
        return {
          rows: [
            { requester_id: 42, receiver_id: 7 },
            { requester_id: 9, receiver_id: 42 },
          ],
        };
      }
      return { rows: [{ wins: "3", total: "5" }] };
    },
  };
  const controller = createFriendWinsController({ pool });
  const res = createResponse();

  await controller.getWins({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(queries.length, 2);
  assert.equal(
    queries[0].sql,
    `SELECT requester_id, receiver_id FROM friendships
       WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`
  );
  assert.deepEqual(queries[0].params, [42]);
  assert.equal(
    queries[1].sql,
    `SELECT
         COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
         COUNT(*) AS total
       FROM battle_history
       WHERE user_id = $1 AND opponent_id = ANY($2)`
  );
  assert.deepEqual(queries[1].params, [42, [7, 9]]);
  assert.deepEqual(res.body, { wins: 3, total: 5 });
});

test("friend wins preserves the existing safe error response", async () => {
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
  const controller = createFriendWinsController({ pool, logger });
  const res = createResponse();

  await controller.getWins({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Wins vs friends xatosi:", "database unavailable"]]);
});
