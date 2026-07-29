const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireParent } = require("../auth");
const {
  createParentChildrenListService,
} = require("../src/services/parentChildrenListService");
const {
  createParentChildrenListController,
} = require("../src/controllers/parentChildrenListController");
const parentChildrenListRoutes = require("../src/routes/parentChildrenListRoutes");

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

test("parent children list preserves SQL, helper calls, mapping, and fallbacks", async () => {
  const queries = [];
  const leagueRatings = [];
  const activityDates = [];
  const linkedAt = new Date("2026-01-02T00:00:00Z");
  const lastPlayed = new Date("2026-01-03T00:00:00Z");
  const service = createParentChildrenListService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return {
          rows: [{
            student_id: 11,
            first_name: "",
            last_name: "",
            cefr_level: null,
            rating: null,
            xp: null,
            relationship: null,
            is_banned: 1,
            last_played: lastPlayed,
            linked_at: linkedAt,
          }],
        };
      },
    },
    parentLeagueName(rating) {
      leagueRatings.push(rating);
      return "Bronze";
    },
    activityLabel(date) {
      activityDates.push(date);
      return "Bugun";
    },
  });

  assert.deepEqual(await service.listChildren(3), [{
    student_id: 11,
    name: "Farzand",
    cefr_level: "A1",
    league: "Bronze",
    rating: 0,
    xp: 0,
    relationship: "guardian",
    is_banned: true,
    last_activity_label: "Bugun",
    linked_at: linkedAt,
  }]);
  assert.deepEqual(leagueRatings, [null]);
  assert.deepEqual(activityDates, [lastPlayed]);
  assert.deepEqual(queries, [{
    sql: `SELECT pl.student_id, pl.relationship, pl.linked_at,
              u.first_name, u.last_name, u.cefr_level, u.rating, u.xp, u.is_banned,
              (SELECT MAX(played_at) FROM battle_history bh WHERE bh.user_id = u.id) AS last_played
       FROM parent_links pl
       JOIN users u ON u.id = pl.student_id
       WHERE pl.parent_id = $1 AND pl.status = 'active'
       ORDER BY pl.linked_at DESC`,
    params: [3],
  }]);
});

test("parent children list controller preserves response and error logging", async () => {
  const successController = createParentChildrenListController({
    pool: { async query() { return { rows: [] }; } },
    parentLeagueName: assert.fail,
    activityLabel: assert.fail,
  });
  const successResponse = createResponse();
  await successController.listChildren({ user: { id: 3 } }, successResponse);
  assert.deepEqual(successResponse.body, { children: [] });

  const errorController = createParentChildrenListController({
    pool: { async query() { throw new Error("database unavailable"); } },
    parentLeagueName: assert.fail,
    activityLabel: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.listChildren({ user: { id: 3 } }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Bolalar ro'yxati xatosi:", "database unavailable"]]);
});

test("parent children list route preserves path and middleware order", () => {
  const router = parentChildrenListRoutes({
    pool: { query: assert.fail },
    parentLeagueName: assert.fail,
    activityLabel: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/parent/children");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireParent);
  assert.equal(layer.route.stack.length, 3);
});
