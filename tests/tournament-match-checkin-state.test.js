const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const {
  createTournamentMatchCheckinStateService,
} = require("../src/services/tournamentMatchCheckinStateService");
const {
  createTournamentMatchCheckinStateController,
} = require("../src/controllers/tournamentMatchCheckinStateController");
const tournamentMatchCheckinStateRoutes = require("../src/routes/tournamentMatchCheckinStateRoutes");

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

test("check-in state preserves SQL order and response mapping", async () => {
  const match = {
    id: 7,
    tournament_id: 4,
    status: "checkin",
    school_a: "1-maktab",
    school_b: "2-maktab",
    school_a_key: "one",
    school_b_key: "two",
    scheduled_at: "2026-07-28T12:00:00.000Z",
    tournament_name: "Cup",
    questions_per_match: 10,
    seconds_per_match: 120,
  };
  const queries = [];
  const responses = [
    { rows: [match] },
    { rows: [{ school: "1-maktab", school_key: "one", checked_in: true }] },
    {
      rows: [
        {
          user_id: 11,
          school: "1-maktab",
          school_key: "one",
          checked_in: true,
          first_name: "Ali",
          last_name: null,
          profile_picture: null,
          rating: 1200,
          member_role: null,
          slot_order: 1,
        },
        {
          user_id: 12,
          school: "Other",
          school_key: "other",
          checked_in: false,
          first_name: "Vali",
          last_name: "Test",
          profile_picture: "pic.png",
          rating: 1100,
          member_role: "captain",
          slot_order: 1,
        },
      ],
    },
  ];
  const service = createTournamentMatchCheckinStateService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });

  const outcome = await service.getCheckinState("7", 11);
  assert.equal(outcome.status, "found");
  assert.deepEqual(queries.map((query) => query.params), [["7"], ["7", 11], ["7", 4]]);
  assert.equal(outcome.result.my_school, "1-maktab");
  assert.equal(outcome.result.teams.one.members[0].name, "Ali");
  assert.equal(outcome.result.teams.one.members[0].role, "starter");
  assert.equal(outcome.result.teams.one.members[0].is_me, true);
  assert.equal(outcome.result.teams.other.members[0].name, "Vali Test");
  assert.deepEqual(outcome.result.match, {
    id: 7,
    status: "checkin",
    school_a: "1-maktab",
    school_b: "2-maktab",
    school_a_key: "one",
    school_b_key: "two",
    scheduled_at: "2026-07-28T12:00:00.000Z",
    tournament_name: "Cup",
    questions_per_match: 10,
    seconds_per_match: 120,
  });
});

test("check-in state preserves not-found and not-participant short circuits", async () => {
  const notFound = createTournamentMatchCheckinStateService({
    pool: { async query() { return { rows: [] }; } },
  });
  assert.deepEqual(await notFound.getCheckinState(7, 11), { status: "not-found" });

  let calls = 0;
  const notParticipant = createTournamentMatchCheckinStateService({
    pool: {
      async query() {
        calls += 1;
        return calls === 1 ? { rows: [{ tournament_id: 4 }] } : { rows: [] };
      },
    },
  });
  assert.deepEqual(await notParticipant.getCheckinState(7, 11), { status: "not-participant" });
  assert.equal(calls, 2);
});

test("check-in state controller preserves status responses and error logging", async () => {
  const cases = [
    [{ rows: [] }, 404, { error: "Match topilmadi" }],
    [[{ rows: [{ tournament_id: 4 }] }, { rows: [] }], 403, { error: "Siz bu matchning ishtirokchisi emassiz" }],
  ];
  for (const [fixture, expectedStatus, expectedBody] of cases) {
    const responses = Array.isArray(fixture) ? fixture.slice() : [fixture];
    const controller = createTournamentMatchCheckinStateController({
      pool: { async query() { return responses.shift(); } },
    });
    const response = createResponse();
    await controller.getCheckinState({ params: { id: "7" }, user: { id: 11 } }, response);
    assert.equal(response.statusCode, expectedStatus);
    assert.deepEqual(response.body, expectedBody);
  }

  const controller = createTournamentMatchCheckinStateController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.getCheckinState({ params: { id: "7" }, user: { id: 11 } }, response);
  } finally {
    console.error = originalError;
  }
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Checkin-state xatosi:", "database unavailable"]]);
});

test("check-in state route preserves path and middleware order", () => {
  const router = tournamentMatchCheckinStateRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/tournament/match/:id/checkin-state");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
