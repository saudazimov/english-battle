const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTournamentMatchCompletionCheckService,
} = require("../src/services/tournamentMatchCompletionCheckService");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function match(overrides = {}) {
  return {
    id: 12,
    tournament_id: 3,
    round: 2,
    match_no: 4,
    status: "live",
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
  const checkMatchCompletion = createTournamentMatchCompletionCheckService({
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
    async advanceWinner(...args) {
      calls.push(["advance", ...args]);
    },
    notifyMatchPlayers(...args) {
      calls.push(["notify", ...args]);
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
  return { calls, checkMatchCompletion, client };
}

test("preserves connection error propagation", async () => {
  const databaseError = new Error("connect failed");
  const harness = createHarness({ connectError: databaseError });

  await assert.rejects(() => harness.checkMatchCompletion(12), (error) => error === databaseError);
  assert.deepEqual(harness.calls, [["connect"]]);
});

test("preserves missing, done, empty-player, and unfinished guards", async () => {
  const cases = [
    [{ rows: [] }],
    [{ rows: [match({ status: "done" })] }],
    [{ rows: [match()] }, { rows: [] }],
    [{ rows: [match()] }, { rows: [{ school_key: "school-a", score: 1, finished: false }] }],
  ];

  for (const caseResponses of cases) {
    const responses = [{ rows: [] }, ...caseResponses, { rows: [] }];
    const harness = createHarness({ responses });
    assert.equal(await harness.checkMatchCompletion(12), undefined);
    assert.equal(harness.calls.some((call) => call[0] === "advance" || call[0] === "notify"), false);
    assert.equal(harness.calls.at(-2)[1], "ROLLBACK");
    assert.deepEqual(harness.calls.at(-1), ["release"]);
  }
});

test("preserves score calculation, winner advancement, commit, and notification", async () => {
  const currentMatch = match();
  const players = [
    { school_key: "school-a", score: 3, finished: true },
    { school_key: "school-a", score: 2, finished: true },
    { school_key: "school-b", score: 4, finished: true },
    { school_key: "unknown", score: 100, finished: true },
  ];
  const harness = createHarness({
    responses: [
      { rows: [] },
      { rows: [currentMatch] },
      { rows: players },
      { rows: [] },
      { rows: [] },
    ],
  });

  await harness.checkMatchCompletion("12");

  const update = harness.calls.find((call) => call[0] === "query" && call[1].startsWith("UPDATE tournament_matches"));
  assert.deepEqual(update[2], [5, 4, "1-maktab", "school-a", "12"]);
  const advanceIndex = harness.calls.findIndex((call) => call[0] === "advance");
  const commitIndex = harness.calls.findIndex((call) => call[0] === "query" && call[1] === "COMMIT");
  assert.deepEqual(harness.calls[advanceIndex].slice(2), [3, 2, 4, "1-maktab", "school-a"]);
  assert.ok(advanceIndex < commitIndex);
  assert.deepEqual(harness.calls.find((call) => call[0] === "notify"), [
    "notify",
    "12",
    "matchFinished",
    {
      matchId: 12,
      score_a: 5,
      score_b: 4,
      school_a: "1-maktab",
      school_b: "2-maktab",
      winner: "1-maktab",
      winner_key: "school-a",
    },
  ]);
  assert.deepEqual(harness.calls.at(-1), ["release"]);
});

test("preserves tied-score speed winner and seeded fallback", async () => {
  const tiedPlayers = [
    { school_key: "school-a", score: 2, finished: true },
    { school_key: "school-b", score: 2, finished: true },
  ];
  const scenarios = [
    {
      times: [
        { school_key: "school-a", last_finish: "2026-07-26T10:00:00.000Z" },
        { school_key: "school-b", last_finish: "2026-07-26T10:01:00.000Z" },
      ],
      seededWinner: undefined,
      expected: ["1-maktab", "school-a"],
      seededCalls: 0,
    },
    {
      times: [
        { school_key: "school-a", last_finish: "2026-07-26T10:00:00.000Z" },
        { school_key: "school-b", last_finish: "2026-07-26T10:00:00.000Z" },
      ],
      seededWinner: { school: "2-maktab", school_key: "school-b" },
      expected: ["2-maktab", "school-b"],
      seededCalls: 1,
    },
  ];

  for (const scenario of scenarios) {
    const harness = createHarness({
      responses: [
        { rows: [] },
        { rows: [match()] },
        { rows: tiedPlayers },
        { rows: scenario.times },
        { rows: [] },
        { rows: [] },
      ],
      seededWinner: scenario.seededWinner,
    });
    await harness.checkMatchCompletion(12);
    const update = harness.calls.find((call) => call[0] === "query" && call[1].startsWith("UPDATE tournament_matches"));
    assert.deepEqual(update[2].slice(2, 4), scenario.expected);
    assert.equal(harness.calls.filter((call) => call[0] === "seeded").length, scenario.seededCalls);
    assert.match(harness.calls.find((call) => call[0] === "log")[1], /DURANG \(2-2\)/);
  }
});

test("preserves rollback, error logging, and release on transactional failure", async () => {
  const harness = createHarness({
    responses: [{ rows: [] }, new Error("match read failed"), { rows: [] }],
  });

  assert.equal(await harness.checkMatchCompletion(12), undefined);
  assert.deepEqual(harness.calls.at(-3), ["query", "ROLLBACK", undefined]);
  assert.deepEqual(harness.calls.at(-2), ["error", "checkMatchCompletion xatosi:", "match read failed"]);
  assert.deepEqual(harness.calls.at(-1), ["release"]);
});
