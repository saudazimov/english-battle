const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendSuggestedController } = require("../src/controllers/friendSuggestedController");

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

test("friend suggestions preserves the not-found response", async () => {
  let queryCount = 0;
  const pool = {
    async query() {
      queryCount += 1;
      return { rows: [] };
    },
  };
  const controller = createFriendSuggestedController({ pool });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(queryCount, 1);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Topilmadi" });
});

test("friend suggestions preserves queries, exclusion, scoring and ordering", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (queries.length === 1) {
        return { rows: [{ region: "R", district: "D", school: "S", cefr_level: "A1", rating: 1000 }] };
      }
      if (queries.length === 2) {
        return { rows: [{ requester_id: 42, receiver_id: 2 }] };
      }
      return {
        rows: [
          { id: 2, first_name: "Excluded", last_name: "User", cefr_level: "A1", rating: 1000, region: "R", district: "D", school: "S" },
          { id: 3, first_name: "School", last_name: "Mate", cefr_level: "A1", rating: 1000, region: "R", district: "D", school: "S" },
          { id: 4, first_name: "District", last_name: "Mate", cefr_level: "B1", rating: 1300, region: "R", district: "D", school: "Other" },
          { id: 5, first_name: "Region", last_name: "Mate", cefr_level: "A1", rating: 900, region: "R", district: "Other", school: "Other" },
          { id: 6, first_name: "Level", last_name: "Mate", cefr_level: "A1", rating: 1000, region: "Other", district: "Other", school: "Other" },
          { id: 7, first_name: "Rating", last_name: "Mate", cefr_level: "B2", rating: 1000, region: "Other", district: "Other", school: "Other" },
          { id: 8, first_name: "No", last_name: "Match", cefr_level: "B2", rating: 1500, region: "Other", district: "Other", school: "Other" },
        ],
      };
    },
  };
  const controller = createFriendSuggestedController({ pool });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(queries.length, 3);
  assert.equal(queries[0].sql, "SELECT region, district, school, cefr_level, rating FROM users WHERE id = $1");
  assert.deepEqual(queries[0].params, [42]);
  assert.equal(
    queries[1].sql,
    `SELECT requester_id, receiver_id FROM friendships
       WHERE requester_id = $1 OR receiver_id = $1`
  );
  assert.deepEqual(queries[1].params, [42]);
  assert.equal(
    queries[2].sql,
    `SELECT id, first_name, last_name, cefr_level, rating, region, district, school
       FROM users WHERE id != $1`
  );
  assert.deepEqual(queries[2].params, [42]);
  assert.deepEqual(res.body.suggested.map(({ id, score, reason }) => ({ id, score, reason })), [
    { id: 3, score: 145, reason: "Maktabdosh" },
    { id: 5, score: 65, reason: "Bir viloyatdan" },
    { id: 4, score: 50, reason: "Bir tumandan" },
    { id: 6, score: 45, reason: "A1 daraja" },
    { id: 7, score: 15, reason: "Tavsiya" },
  ]);
});

test("friend suggestions preserves the existing safe error response", async () => {
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
  const controller = createFriendSuggestedController({ pool, logger });
  const res = createResponse();

  await controller.list({ user: { id: 42 }, params: { userId: "999999" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Suggested xatosi:", "database unavailable"]]);
});
