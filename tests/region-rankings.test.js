const test = require("node:test");
const assert = require("node:assert/strict");
const { createRegionRankingsController } = require("../src/controllers/regionRankingsController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
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

test("region rankings preserves the aggregate query and response", async () => {
  const regions = [{ region: "Namangan", player_count: "5", total_rating: "4940" }];
  const queries = [];
  const controller = createRegionRankingsController({
    pool: {
      query: async (sql) => {
        queries.push(sql);
        return { rows: regions };
      },
    },
  });
  const response = createResponse();

  await controller.list({}, response);

  assert.deepEqual(queries, [
    `SELECT
         region,
         COUNT(*) AS player_count,
         SUM(rating) AS total_rating,
         ROUND(AVG(rating)) AS avg_rating
       FROM users
       WHERE region IS NOT NULL AND region <> ''
       GROUP BY region
       ORDER BY total_rating DESC
       LIMIT 50`,
  ]);
  assert.deepEqual(response.body, { regions });
});

test("region rankings preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createRegionRankingsController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.list({}, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Viloyat reytingi xatosi:", "database unavailable"]]);
});
