const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const { REGIONS } = require("../regions");
const {
  createAdminTournamentRegionsController,
} = require("../src/controllers/adminTournamentRegionsController");
const createAdminTournamentRegionsRoutes = require("../src/routes/adminTournamentRegionsRoutes");

test("admin tournament regions controller preserves the exact response", () => {
  const regions = [{ name: "Toshkent", districts: ["Bektemir"] }];
  const controller = createAdminTournamentRegionsController({ regions });
  const response = {
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
  };

  assert.equal(controller.list({}, response), undefined);
  assert.deepEqual(response.body, { regions });
  assert.equal(response.body.regions, regions);
});

test("admin tournament regions route preserves path, method, and admin middleware order", () => {
  const router = createAdminTournamentRegionsRoutes();

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/tournaments/regions-list");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);

  const response = {
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
  };
  assert.equal(route.stack[1].handle({}, response), undefined);
  assert.deepEqual(response.body, { regions: REGIONS });
});
