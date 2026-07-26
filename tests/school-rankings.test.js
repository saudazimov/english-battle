const test = require("node:test");
const assert = require("node:assert/strict");
const { createSchoolRankingsController } = require("../src/controllers/schoolRankingsController");

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

test("school rankings preserves the aggregate query and response", async () => {
  const rows = [{ school: "1-maktab", total_rating: "2500" }];
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows };
    },
  };
  const controller = createSchoolRankingsController({ pool });
  const res = createResponse();

  await controller.list({}, res);

  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    `SELECT
         school,
         region,
         district,
         COUNT(*) AS player_count,
         SUM(rating) AS total_rating,
         ROUND(AVG(rating)) AS avg_rating
       FROM users
       WHERE school IS NOT NULL AND school <> ''
       GROUP BY school, region, district
       ORDER BY total_rating DESC
       LIMIT 50`
  );
  assert.equal(queries[0].params, undefined);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { schools: rows });
});

test("school rankings preserves the existing safe error response", async () => {
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
  const controller = createSchoolRankingsController({ pool, logger });
  const res = createResponse();

  await controller.list({}, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Maktab reytingi xatosi:", "database unavailable"]]);
});
