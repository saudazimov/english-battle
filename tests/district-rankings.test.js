const test = require("node:test");
const assert = require("node:assert/strict");
const { createDistrictRankingsController } = require("../src/controllers/districtRankingsController");

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

test("district rankings preserves the aggregate query and response", async () => {
  const districts = [{ district: "Chust", region: "Namangan", player_count: "4" }];
  const queries = [];
  const controller = createDistrictRankingsController({
    pool: {
      query: async (sql) => {
        queries.push(sql);
        return { rows: districts };
      },
    },
  });
  const response = createResponse();

  await controller.list({}, response);

  assert.deepEqual(queries, [
    `SELECT district, region,
              COUNT(*) as player_count,
              SUM(rating) as total_rating,
              ROUND(AVG(rating)) as avg_rating
       FROM users
       WHERE district IS NOT NULL AND district != ''
       GROUP BY district, region
       ORDER BY total_rating DESC`,
  ]);
  assert.deepEqual(response.body, { districts });
});

test("district rankings preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createDistrictRankingsController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.list({}, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Tuman reyting xatosi:", "database unavailable"]]);
});
