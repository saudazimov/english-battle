const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendActivityController } = require("../src/controllers/friendActivityController");

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

test("friend activity preserves the empty response when there are no accepted friends", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const controller = createFriendActivityController({ pool });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, [42]);
  assert.deepEqual(res.body, { activities: [] });
});

test("friend activity preserves both queries and activity mapping", async () => {
  const playedAt = new Date("2026-07-03T05:58:45.073Z");
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
      return {
        rows: [{
          user_id: 7,
          opponent_name: "Vali",
          my_score: 10,
          opponent_score: 8,
          outcome: "win",
          rating_change: 20,
          played_at: playedAt,
          first_name: "Ali",
          last_name: "Karimov",
          rating: 1020,
          profile_picture: null,
        }],
      };
    },
  };
  const controller = createFriendActivityController({ pool });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(queries.length, 2);
  assert.equal(
    queries[0].sql,
    `SELECT requester_id, receiver_id FROM friendships
       WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`
  );
  assert.deepEqual(queries[0].params, [42]);
  assert.equal(
    queries[1].sql,
    `SELECT bh.user_id, bh.opponent_name, bh.my_score, bh.opponent_score,
              bh.outcome, bh.rating_change, bh.played_at,
              u.first_name, u.last_name, u.rating, u.profile_picture
       FROM battle_history bh
       JOIN users u ON u.id = bh.user_id
       WHERE bh.user_id = ANY($1)
       ORDER BY bh.played_at DESC
       LIMIT 10`
  );
  assert.deepEqual(queries[1].params, [[7, 9]]);
  assert.deepEqual(res.body, {
    activities: [{
      type: "battle",
      friendId: 7,
      friendName: "Ali Karimov",
      friendFirst: "Ali",
      friendPic: null,
      outcome: "win",
      myScore: 10,
      oppScore: 8,
      opponentName: "Vali",
      ratingChange: 20,
      rating: 1020,
      time: playedAt,
    }],
  });
});

test("friend activity preserves the existing safe error response", async () => {
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
  const controller = createFriendActivityController({ pool, logger });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Faoliyat xatosi:", "database unavailable"]]);
});
