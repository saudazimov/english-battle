const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const {
  createTournamentMatchAnswerService,
} = require("../src/services/tournamentMatchAnswerService");
const {
  createTournamentMatchAnswerController,
} = require("../src/controllers/tournamentMatchAnswerController");
const tournamentMatchAnswerRoutes = require("../src/routes/tournamentMatchAnswerRoutes");

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

function liveMatch(questionsData) {
  return {
    status: "live",
    questions_data: questionsData,
    started_at: "2999-01-01T00:00:00.000Z",
    seconds_per_match: 120,
  };
}

test("match answer preserves successful SQL, score update, and notification", async () => {
  const calls = [];
  const notifications = [];
  const question = { id: 4, correct_option: "A" };
  const client = createClient([
    { rows: [] },
    { rows: [liveMatch(JSON.stringify([question]))] },
    { rows: [{ id: 8, checked_in: true, finished: false }] },
    { rows: [{ id: 20 }] },
    { rows: [] },
    { rows: [{ school_key: "one", total: "4" }, { school_key: "two", total: null }] },
    { rows: [] },
  ], calls);
  const service = createTournamentMatchAnswerService({
    expireTournamentMatch: assert.fail,
    notifyMatchPlayers(...args) {
      notifications.push(args);
    },
  });

  const outcome = await service.submitAnswer(client, "7", 11, {
    questionId: "4",
    answer: "A",
  });
  assert.deepEqual(outcome, {
    status: "submitted",
    correct: true,
    correctOption: "A",
    teamScores: { one: 4, two: 0 },
  });
  assert.equal(calls[0][0], "BEGIN");
  assert.match(calls[1][0], /FOR UPDATE OF m$/);
  assert.match(calls[3][0], /ON CONFLICT \(match_id, user_id, question_id\) DO NOTHING/);
  assert.deepEqual(calls[3][1], ["7", 11, 4, "a", true]);
  assert.equal(calls[4][0], "UPDATE tournament_match_players SET score = score + 1 WHERE match_id = $1 AND user_id = $2");
  assert.equal(calls.at(-1)[0], "COMMIT");
  assert.deepEqual(notifications, [["7", "scoreUpdate", {
    matchId: 7,
    team_scores: { one: 4, two: 0 },
  }]]);
});

test("match answer preserves validation and transaction short circuits", async () => {
  const question = { id: 4, correct_option: "a" };
  const fixtures = [
    [[], { questionId: 4, answer: "x" }, { status: "invalid-answer" }, null],
    [[{ rows: [] }, { rows: [] }, { rows: [] }], { questionId: 4, answer: "a" }, { status: "inactive" }, "ROLLBACK"],
    [[{ rows: [] }, { rows: [liveMatch([question])] }, { rows: [] }, { rows: [] }], { questionId: 4, answer: "a" }, { status: "not-active-participant" }, "ROLLBACK"],
    [[{ rows: [] }, { rows: [liveMatch([question])] }, { rows: [{ checked_in: true, finished: true }] }, { rows: [] }], { questionId: 4, answer: "a" }, { status: "finished" }, "ROLLBACK"],
    [[{ rows: [] }, { rows: [liveMatch([])] }, { rows: [{ checked_in: true, finished: false }] }, { rows: [] }], { questionId: 4, answer: "a" }, { status: "question-not-found" }, "ROLLBACK"],
    [[{ rows: [] }, { rows: [liveMatch([question])] }, { rows: [{ checked_in: true, finished: false }] }, { rows: [] }, { rows: [] }], { questionId: 4, answer: "a" }, { status: "duplicate" }, "ROLLBACK"],
  ];

  for (const [responses, body, expected, finalQuery] of fixtures) {
    const calls = [];
    const service = createTournamentMatchAnswerService({
      expireTournamentMatch: assert.fail,
      notifyMatchPlayers: assert.fail,
    });
    assert.deepEqual(await service.submitAnswer(createClient(responses, calls), "7", 11, body), expected);
    assert.equal(calls.length ? calls.at(-1)[0] : null, finalQuery);
  }
});

test("match answer preserves timeout rollback and expiry call", async () => {
  const calls = [];
  const expired = [];
  const pastMatch = liveMatch([]);
  pastMatch.started_at = "2000-01-01T00:00:00.000Z";
  const service = createTournamentMatchAnswerService({
    async expireTournamentMatch(matchId) {
      expired.push(matchId);
    },
    notifyMatchPlayers: assert.fail,
  });
  const client = createClient([
    { rows: [] },
    { rows: [pastMatch] },
    { rows: [{ checked_in: true, finished: false }] },
    { rows: [] },
  ], calls);

  assert.deepEqual(
    await service.submitAnswer(client, "7", 11, { questionId: 4, answer: "a" }),
    { status: "expired" }
  );
  assert.equal(calls.at(-1)[0], "ROLLBACK");
  assert.deepEqual(expired, ["7"]);
});

test("match answer controller preserves response, error handling, and connection behavior", async () => {
  const validationCalls = [];
  const validationController = createTournamentMatchAnswerController({
    pool: { async connect() { return createClient([], validationCalls); } },
    expireTournamentMatch: assert.fail,
    notifyMatchPlayers: assert.fail,
  });
  const validationResponse = createResponse();
  await validationController.submitAnswer(
    { params: { id: "7" }, user: { id: 11 }, body: { answer: "x" } },
    validationResponse
  );
  assert.equal(validationResponse.statusCode, 400);
  assert.deepEqual(validationResponse.body, { error: "Javob varianti noto'g'ri" });
  assert.deepEqual(validationCalls, [["release"]]);

  const errorCalls = [];
  const errorController = createTournamentMatchAnswerController({
    pool: {
      async connect() {
        return createClient([{ rows: [] }, new Error("database unavailable"), { rows: [] }], errorCalls);
      },
    },
    expireTournamentMatch: assert.fail,
    notifyMatchPlayers: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.submitAnswer(
      { params: { id: "7" }, user: { id: 11 }, body: { answer: "a" } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Answer xatosi:", "database unavailable"]]);
  assert.deepEqual(errorCalls.slice(-2), [["ROLLBACK", undefined], ["release"]]);

  const connectionController = createTournamentMatchAnswerController({
    pool: { async connect() { throw new Error("connect failed"); } },
    expireTournamentMatch: assert.fail,
    notifyMatchPlayers: assert.fail,
  });
  await assert.rejects(
    connectionController.submitAnswer(
      { params: { id: "7" }, user: { id: 11 }, body: { answer: "a" } },
      createResponse()
    ),
    { message: "connect failed" }
  );
});

test("match answer route preserves path and middleware order", () => {
  const router = tournamentMatchAnswerRoutes({
    pool: { connect: assert.fail },
    expireTournamentMatch: assert.fail,
    notifyMatchPlayers: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/tournament/match/:id/answer");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
