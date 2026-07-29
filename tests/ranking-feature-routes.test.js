const test = require("node:test");
const assert = require("node:assert/strict");

const rankingFeatureRoutes = require("../src/routes/rankingFeatureRoutes");

test("ranking feature routes preserve phased dependencies", () => {
  const calls = [];
  const app = {};
  const pool = {};
  const currentSeason = () => {};
  const routes = {
    registerGeneral(dependencies) {
      calls.push(["general", dependencies]);
    },
    registerGeographic(dependencies) {
      calls.push(["geographic", dependencies]);
    },
  };

  rankingFeatureRoutes.registerGeneralRoutes({
    app,
    pool,
    currentSeason,
    routes,
  });
  rankingFeatureRoutes.registerGeographicRoutes({ app, routes });

  assert.deepEqual(calls, [
    ["general", { app, pool, currentSeason }],
    ["geographic", { app }],
  ]);
});
