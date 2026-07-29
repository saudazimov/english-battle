const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const {
  createTournamentMatchFinishService,
} = require("../src/services/tournamentMatchFinishService");
const {
  createTournamentMatchFinishController,
} = require("../src/controllers/tournamentMatchFinishController");
const tournamentMatchFinishRoutes = require("../src/routes/tournamentMatchFinishRoutes");

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

function createClient(responses, calls) {
  return {
    async query(sql, params) {
      calls.push([sql.replace(/\s+/g, " ").trim(), params]);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response || { rows: [] };
    },
    release() {
      calls.push(["release"]);
    },
  };
}

function liveMatch(overrides = {}) {
  return {
    status: "live",
    questions_data: JSON.stringify([{ id: 1 }, { id: 2 }]),
    started_at: "2999-01-01T00:00:00.000Z",
    seconds_per_match: 120,
    ...overrides,
  };
}

test("match finish preserves successful transaction and completion order", async () => {
  const calls = [];
  const helpers = [];
  const client = createClient([
    { rows: [] },
    { rows: [liveMatch()] },
    { rows: [{ checked_in: true, finished: false }] },
    { rows: [{ c: "2" }] },
    { rows: [] },
    { rows: [] },
  ], calls);
  const service = createTournamentMatchFinishService({
    expireTournamentMatch: assert.fail,
    async checkMatchCompletion(matchId) {
      helpers.push(["complete", matchId]);
    },
  });

  assert.deepEqual(await service.finishMatch(client, "7", 11), { status: "finished" });
  assert.deepEqual(calls.map((call) => call[1]), [
    undefined,
    ["7"],
    ["7", 11],
    ["7", 11],
    ["7", 11],
    undefined,
  ]);
  assert.equal(calls[0][0], "BEGIN");
  assert.match(calls[1][0], /FOR UPDATE OF m$/);
  assert.equal(calls[4][0], "UPDATE tournament_match_players SET finished = true, finished_at = NOW() WHERE match_id = $1 AND user_id = $2");
  assert.equal(calls[5][0], "COMMIT");
  assert.deepEqual(helpers, [["complete", "7"]]);
});

test("match finish preserves timeout path and expiry call", async () => {
  const calls = [];
  const helpers = [];
  const service = createTournamentMatchFinishService({
    async expireTournamentMatch(matchId) {
      helpers.push(["expire", matchId]);
    },
    checkMatchCompletion: assert.fail,
  });
  const client = createClient([
    { rows: [] },
    { rows: [liveMatch({ started_at: "2000-01-01T00:00:00.000Z" })] },
    { rows: [{ checked_in: true, finished: false }] },
    { rows: [{ c: "0" }] },
    { rows: [] },
    { rows: [] },
  ], calls);

  assert.deepEqual(await service.finishMatch(client, "7", 11), { status: "finished" });
  assert.equal(calls.at(-1)[0], "COMMIT");
  assert.deepEqual(helpers, [["expire", "7"]]);
});

test("match finish preserves guarded transaction outcomes", async () => {
  const fixtures = [
    [[{ rows: [] }, { rows: [] }, { rows: [] }], { status: "inactive" }, "ROLLBACK"],
    [[{ rows: [] }, { rows: [liveMatch()] }, { rows: [] }, { rows: [] }], { status: "not-active-participant" }, "ROLLBACK"],
    [[{ rows: [] }, { rows: [liveMatch()] }, { rows: [{ checked_in: true, finished: true }] }, { rows: [] }], { status: "already-finished" }, "COMMIT"],
    [[{ rows: [] }, { rows: [liveMatch()] }, { rows: [{ checked_in: true, finished: false }] }, { rows: [{ c: "1" }] }, { rows: [] }], { status: "incomplete" }, "ROLLBACK"],
  ];

  for (const [responses, expected, finalQuery] of fixtures) {
    const calls = [];
    const service = createTournamentMatchFinishService({
      expireTournamentMatch: assert.fail,
      checkMatchCompletion: assert.fail,
    });
    assert.deepEqual(await service.finishMatch(createClient(responses, calls), "7", 11), expected);
    assert.equal(calls.at(-1)[0], finalQuery);
  }
});

test("match finish controller preserves responses and error handling", async () => {
  const alreadyCalls = [];
  const alreadyController = createTournamentMatchFinishController({
    pool: {
      async connect() {
        return createClient([
          { rows: [] },
          { rows: [liveMatch()] },
          { rows: [{ checked_in: true, finished: true }] },
          { rows: [] },
        ], alreadyCalls);
      },
    },
    expireTournamentMatch: assert.fail,
    checkMatchCompletion: assert.fail,
  });
  const alreadyResponse = createResponse();
  await alreadyController.finishMatch(
    { params: { id: "7" }, user: { id: 11 } },
    alreadyResponse
  );
  assert.deepEqual(alreadyResponse.body, { success: true, already_finished: true });
  assert.equal(alreadyCalls.at(-1)[0], "release");

  const errorCalls = [];
  const errorController = createTournamentMatchFinishController({
    pool: {
      async connect() {
        return createClient([{ rows: [] }, new Error("database unavailable"), { rows: [] }], errorCalls);
      },
    },
    expireTournamentMatch: assert.fail,
    checkMatchCompletion: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.finishMatch(
      { params: { id: "7" }, user: { id: 11 } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Finish xatosi:", "database unavailable"]]);
  assert.deepEqual(errorCalls.slice(-2), [["ROLLBACK", undefined], ["release"]]);

  const connectionController = createTournamentMatchFinishController({
    pool: { async connect() { throw new Error("connect failed"); } },
    expireTournamentMatch: assert.fail,
    checkMatchCompletion: assert.fail,
  });
  await assert.rejects(
    connectionController.finishMatch(
      { params: { id: "7" }, user: { id: 11 } },
      createResponse()
    ),
    { message: "connect failed" }
  );
});

test("match finish route preserves path and middleware order", () => {
  const router = tournamentMatchFinishRoutes({
    pool: { connect: assert.fail },
    expireTournamentMatch: assert.fail,
    checkMatchCompletion: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/tournament/match/:id/finish");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
