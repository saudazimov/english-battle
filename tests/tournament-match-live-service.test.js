const test = require("node:test");
const assert = require("node:assert/strict");

const { createTournamentMatchLiveService } = require("../src/services/tournamentMatchLiveService");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function match(overrides = {}) {
  return {
    id: 21,
    tournament_id: 5,
    school_a: "1-maktab",
    school_a_key: "school-a",
    school_b: "2-maktab",
    school_b_key: "school-b",
    ...overrides,
  };
}

function createHarness({ responses = [], connectError, seededWinner } = {}) {
  const calls = [];
  const queuedResponses = responses.slice();
  const client = {
    async query(sql, params) {
      calls.push(["query", normalizeSql(sql), params]);
      const response = queuedResponses.shift();
      if (response instanceof Error) throw response;
      return response || { rows: [] };
    },
    release() {
      calls.push(["release"]);
    },
  };
  const startMatchLive = createTournamentMatchLiveService({
    pool: {
      async connect() {
        calls.push(["connect"]);
        if (connectError) throw connectError;
        return client;
      },
    },
    async getSeededWinner(...args) {
      calls.push(["seeded", ...args]);
      return seededWinner;
    },
    async finishMatchWithWinner(...args) {
      calls.push(["finish", ...args]);
    },
    notifyTournamentResult(...args) {
      calls.push(["tournamentResult", ...args]);
    },
    notifyMatchPlayers(...args) {
      calls.push(["matchPlayers", ...args]);
    },
    logger: {
      log(...args) {
        calls.push(["log", ...args]);
      },
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, client, startMatchLive };
}

test("preserves connection error propagation", async () => {
  const databaseError = new Error("connect failed");
  const harness = createHarness({ connectError: databaseError });

  await assert.rejects(() => harness.startMatchLive(match()), (error) => error === databaseError);
  assert.deepEqual(harness.calls, [["connect"]]);
});

test("preserves seeded walkover when neither school checks in", async () => {
  const currentMatch = match();
  const seededWinner = { school: "1-maktab", school_key: "school-a" };
  const harness = createHarness({
    responses: [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }],
    seededWinner,
  });

  await harness.startMatchLive(currentMatch);

  const seededCall = harness.calls.find((call) => call[0] === "seeded");
  assert.deepEqual(seededCall.slice(2), [5, "1-maktab", "school-a", "2-maktab", "school-b"]);
  const finishCall = harness.calls.find((call) => call[0] === "finish");
  assert.deepEqual(finishCall.slice(2), [currentMatch, "1-maktab", "school-a", 0, 0, true]);
  assert.ok(harness.calls.findIndex((call) => call[0] === "finish") < harness.calls.findIndex((call) => call[0] === "query" && call[1] === "COMMIT"));
  assert.deepEqual(harness.calls.find((call) => call[0] === "tournamentResult"), [
    "tournamentResult", currentMatch, "1-maktab", "school-a",
  ]);
  assert.equal(harness.calls.some((call) => call[0] === "matchPlayers"), false);
  assert.deepEqual(harness.calls.at(-1), ["release"]);
});

test("preserves one-sided walkover winner, commit, notification, and log", async () => {
  const scenarios = [
    {
      readyRows: [{ school_key: "school-b", ready: "2" }],
      winner: ["2-maktab", "school-b"],
      logPattern: /1-maktab kelmadi, 2-maktab walkover/,
    },
    {
      readyRows: [{ school_key: "school-a", ready: "3" }],
      winner: ["1-maktab", "school-a"],
      logPattern: /2-maktab kelmadi, 1-maktab walkover/,
    },
  ];

  for (const scenario of scenarios) {
    const currentMatch = match();
    const harness = createHarness({
      responses: [{ rows: [] }, { rows: [] }, { rows: scenario.readyRows }, { rows: [] }],
    });
    await harness.startMatchLive(currentMatch);
    const finishCall = harness.calls.find((call) => call[0] === "finish");
    assert.deepEqual(finishCall.slice(2), [currentMatch, ...scenario.winner, 0, 0, true]);
    assert.deepEqual(harness.calls.find((call) => call[0] === "tournamentResult").slice(2), [
      ...scenario.winner,
    ]);
    assert.match(harness.calls.find((call) => call[0] === "log")[1], scenario.logPattern);
    assert.deepEqual(harness.calls.at(-1), ["release"]);
  }
});

test("preserves mixed question selection, persistence, and live notification", async () => {
  const currentMatch = match();
  const questions = [{ id: 1 }, { id: 2 }];
  const harness = createHarness({
    responses: [
      { rows: [] },
      { rows: [] },
      { rows: [{ school_key: "school-a", ready: "2" }, { school_key: "school-b", ready: "1" }] },
      { rows: [{ questions_per_match: 2, cefr_level: "mixed" }] },
      { rows: questions },
      { rows: [] },
      { rows: [] },
    ],
  });

  await harness.startMatchLive(currentMatch);

  const questionQuery = harness.calls.find((call) => call[0] === "query" && /FROM questions ORDER BY/.test(call[1]));
  assert.deepEqual(questionQuery[2], [2]);
  const update = harness.calls.find((call) => call[0] === "query" && call[1].startsWith("UPDATE tournament_matches"));
  assert.deepEqual(update[2], [JSON.stringify(questions), 21]);
  const commitIndex = harness.calls.findIndex((call) => call[0] === "query" && call[1] === "COMMIT");
  const notifyIndex = harness.calls.findIndex((call) => call[0] === "matchPlayers");
  assert.ok(commitIndex < notifyIndex);
  assert.deepEqual(harness.calls[notifyIndex], ["matchPlayers", 21, "matchLiveStart", { matchId: 21 }]);
  assert.match(harness.calls.find((call) => call[0] === "log")[1], /1-maktab 2 vs 1 2-maktab/);
});

test("preserves CEFR question fallback and concatenation order", async () => {
  const primaryQuestions = [{ id: 1 }];
  const extraQuestions = [{ id: 2 }, { id: 3 }];
  const harness = createHarness({
    responses: [
      { rows: [] },
      { rows: [] },
      { rows: [{ school_key: "school-a", ready: "1" }, { school_key: "school-b", ready: "1" }] },
      { rows: [{ questions_per_match: 3, cefr_level: "B1" }] },
      { rows: primaryQuestions },
      { rows: extraQuestions },
      { rows: [] },
      { rows: [] },
    ],
  });

  await harness.startMatchLive(match());

  const levelQuery = harness.calls.find((call) => call[0] === "query" && /WHERE cefr_level = \$1/.test(call[1]));
  const extraQuery = harness.calls.find((call) => call[0] === "query" && /WHERE cefr_level <> \$1/.test(call[1]));
  assert.deepEqual(levelQuery[2], ["B1", 3]);
  assert.deepEqual(extraQuery[2], ["B1", 2]);
  const update = harness.calls.find((call) => call[0] === "query" && call[1].startsWith("UPDATE tournament_matches"));
  assert.equal(update[2][0], JSON.stringify([...primaryQuestions, ...extraQuestions]));
});

test("preserves rollback, error logging, and release on transactional failure", async () => {
  const harness = createHarness({
    responses: [{ rows: [] }, new Error("tournament update failed"), { rows: [] }],
  });

  assert.equal(await harness.startMatchLive(match()), undefined);
  assert.deepEqual(harness.calls.at(-3), ["query", "ROLLBACK", undefined]);
  assert.deepEqual(harness.calls.at(-2), ["error", "startMatchLive xatosi:", "tournament update failed"]);
  assert.deepEqual(harness.calls.at(-1), ["release"]);
});
