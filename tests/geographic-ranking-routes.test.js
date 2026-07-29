const test = require("node:test");
const assert = require("node:assert/strict");
const registerGeographicRankingRoutes = require(
  "../src/routes/geographicRankingRoutes"
);

test("geographic ranking registrar preserves route order and methods", () => {
  const mounted = [];
  const app = {
    use(router) {
      mounted.push(router);
    },
  };

  registerGeographicRankingRoutes({ app });

  assert.equal(mounted.length, 3);
  assert.deepEqual(
    mounted.map((router) => router.stack[0].route.path),
    ["/rankings/schools", "/rankings/regions", "/rankings/districts"]
  );
  assert.deepEqual(
    mounted.map((router) => Object.keys(router.stack[0].route.methods)),
    [["get"], ["get"], ["get"]]
  );
  assert.deepEqual(
    mounted.map((router) => router.stack[0].route.stack.length),
    [1, 1, 1]
  );
});
