const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const {
  createTournamentMatchBattleStateService,
} = require("../src/services/tournamentMatchBattleStateService");
const {
  createTournamentMatchBattleStateController,
} = require("../src/controllers/tournamentMatchBattleStateController");
const tournamentMatchBattleStateRoutes = require("../src/routes/tournamentMatchBattleStateRoutes");

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

test("battle state preserves SQL order, filtering, and response mapping", async () => {
  const queries = [];
  const match = {
    id: 7,
    status: "live",
    school_a: "1-maktab",
    school_b: "2-maktab",
    school_a_key: "one",
    school_b_key: "two",
    tournament_name: "Cup",
    seconds_per_match: 120,
    started_at: "2026-07-28T12:00:00.000Z",
    winner_school: null,
    winner_school_key: null,
    questions_data: JSON.stringify([{
      id: 4,
      question_text: "Question?",
      option_a: "A",
      option_b: "B",
      option_c: "C",
      option_d: "D",
      correct_option: "a",
    }]),
  };
  const responses = [
    { rows: [{ school: "1-maktab", school_key: "one" }] },
    { rows: [match] },
    { rows: [{ score: 3, finished: false }] },
    { rows: [{ question_id: 4 }] },
    { rows: [{ school_key: "one", total: "3" }, { school_key: "two", total: null }] },
  ];
  const service = createTournamentMatchBattleStateService({
    pool: {
      async query(sql, params) {
        queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return responses.shift();
      },
    },
  });

  const outcome = await service.getBattleState("7", 11);
  assert.equal(outcome.status, "found");
  assert.deepEqual(queries.map((query) => query.params), [
    ["7", 11],
    ["7"],
    ["7", 11],
    ["7", 11],
    ["7"],
  ]);
  assert.match(queries[0].sql, /^SELECT mp\.id/);
  assert.match(queries[1].sql, /^SELECT m\.\*/);
  assert.deepEqual(outcome.result.questions, [{
    id: 4,
    question_text: "Question?",
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
  }]);
  assert.deepEqual(outcome.result.team_scores, { one: 3, two: 0 });
  assert.equal(outcome.result.my_score, 3);
  assert.equal(outcome.result.my_finished, false);
  assert.deepEqual(outcome.result.answered_question_ids, [4]);
});

test("battle state preserves membership, missing match, and waiting short circuits", async () => {
  const fixtures = [
    [[{ rows: [] }], { status: "not-participant" }, 1],
    [[{ rows: [{ school: "School" }] }, { rows: [] }], { status: "not-found" }, 2],
    [
      [{ rows: [{ school: "School" }] }, { rows: [{ status: "checkin" }] }],
      { status: "waiting", result: { status: "checkin", message: "Jang hali boshlanmagan" } },
      2,
    ],
  ];

  for (const [responses, expected, expectedCalls] of fixtures) {
    let calls = 0;
    const service = createTournamentMatchBattleStateService({
      pool: {
        async query() {
          calls += 1;
          return responses.shift();
        },
      },
    });
    assert.deepEqual(await service.getBattleState("7", 11), expected);
    assert.equal(calls, expectedCalls);
  }
});

test("battle state controller preserves error logging and response", async () => {
  const responses = [
    { rows: [{ school: "School" }] },
    { rows: [{ status: "live", questions_data: "{" }] },
  ];
  const controller = createTournamentMatchBattleStateController({
    pool: { async query() { return responses.shift(); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.getBattleState({ params: { id: "7" }, user: { id: 11 } }, response);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], "Battle-state xatosi:");
  assert.equal(typeof logged[0][1], "string");
});

test("battle state route preserves path and middleware order", () => {
  const router = tournamentMatchBattleStateRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/tournament/match/:id/battle-state");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
