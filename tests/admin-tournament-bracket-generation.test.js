const test = require("node:test");
const assert = require("node:assert/strict");
const { requireAdmin } = require("../auth");
const {
  createAdminTournamentBracketGenerationService,
} = require("../src/services/adminTournamentBracketGenerationService");
const {
  createAdminTournamentBracketGenerationController,
} = require("../src/controllers/adminTournamentBracketGenerationController");
const adminTournamentBracketGenerationRoutes = require(
  "../src/routes/adminTournamentBracketGenerationRoutes"
);

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

test("bracket generation preserves transaction, SQL order, seeding, and schedule", async () => {
  const calls = [];
  const schools = [
    { school: "School A", school_key: "a", avg_rating: 1500 },
    { school: "School B", school_key: "b", avg_rating: 1400 },
    { school: "School C", school_key: "c", avg_rating: 1300 },
  ];
  let queryCount = 0;
  const client = {
    async query(sql, params) {
      calls.push(["query", sql.replace(/\s+/g, " ").trim(), params]);
      queryCount += 1;
      if (queryCount === 1) {
        return {
          rows: [{
            id: 9,
            status: "registration",
            starts_at: "2026-08-01T10:00:00Z",
          }],
        };
      }
      if (queryCount === 2) return { rows: schools };
      return { rows: [{ id: queryCount }] };
    },
  };
  const service = createAdminTournamentBracketGenerationService({
    seedOrder(size) {
      calls.push(["seedOrder", size]);
      return [1, 4, 2, 3];
    },
    async propagateByes(receivedClient, tournamentId) {
      calls.push(["propagateByes", receivedClient, tournamentId]);
    },
  });

  const outcome = await service.generateBracket(client, "9");

  assert.deepEqual(outcome, {
    status: "generated",
    result: {
      success: true,
      bracket_size: 4,
      schools: 3,
      byes: 1,
      rounds: 2,
    },
  });
  assert.equal(calls[0][1], "SELECT * FROM tournaments WHERE id = $1");
  assert.match(calls[1][1], /ORDER BY avg_rating DESC, school ASC$/);
  assert.equal(calls[2][1], "BEGIN");
  assert.deepEqual(calls.slice(3, 6).map((call) => call[2]), [
    [1, "9", "a"],
    [2, "9", "b"],
    [3, "9", "c"],
  ]);
  assert.match(calls[6][1], /^DELETE FROM tournament_match_players/);
  assert.equal(calls[7][1], "DELETE FROM tournament_matches WHERE tournament_id = $1");
  assert.deepEqual(calls[8], ["seedOrder", 4]);

  const firstRoundInsert = calls[9];
  assert.match(firstRoundInsert[1], /^INSERT INTO tournament_matches/);
  assert.deepEqual(firstRoundInsert[2].slice(0, 10), [
    "9", 1, "School A", null, "a", null, "School A", "a", "done", null,
  ]);
  assert.ok(firstRoundInsert[2][10] instanceof Date);

  const secondRoundInsert = calls[10];
  assert.deepEqual(secondRoundInsert[2].slice(0, 10), [
    "9", 2, "School B", "School C", "b", "c", null, null, "pending",
    new Date("2026-08-01T10:00:00Z"),
  ]);
  assert.equal(secondRoundInsert[2][10], null);
  assert.deepEqual(calls[11][2], [
    "9", 2, 1, new Date("2026-08-01T10:30:00Z"),
  ]);
  assert.deepEqual(calls[12], ["propagateByes", client, "9"]);
  assert.deepEqual(calls[13][2], [4, "9"]);
  assert.equal(calls[14][1], "COMMIT");
});

test("bracket generation preserves pre-transaction short circuits", async () => {
  const scenarios = [
    {
      responses: [{ rows: [] }],
      expected: { status: "not-found" },
      queryCount: 1,
    },
    {
      responses: [{ rows: [{ status: "active" }] }],
      expected: { status: "invalid-status", tournamentStatus: "active" },
      queryCount: 1,
    },
    {
      responses: [
        { rows: [{ status: "registration" }] },
        { rows: [{ school: "Only one" }] },
      ],
      expected: { status: "insufficient-schools", schoolCount: 1 },
      queryCount: 2,
    },
  ];

  for (const scenario of scenarios) {
    let calls = 0;
    const service = createAdminTournamentBracketGenerationService({
      seedOrder: assert.fail,
      propagateByes: assert.fail,
    });
    const client = {
      async query() {
        calls += 1;
        return scenario.responses.shift();
      },
    };
    assert.deepEqual(await service.generateBracket(client, "9"), scenario.expected);
    assert.equal(calls, scenario.queryCount);
  }
});

test("bracket generation controller preserves releases and response messages", async () => {
  const scenarios = [
    {
      rows: [],
      statusCode: 404,
      body: { error: "Turnir topilmadi" },
    },
    {
      rows: [{ status: "active" }],
      statusCode: 400,
      body: { error: "Setka faqat 'Ro'yxat' bosqichida yaratiladi (hozir: active)" },
    },
  ];

  for (const scenario of scenarios) {
    let releases = 0;
    const controller = createAdminTournamentBracketGenerationController({
      pool: {
        async connect() {
          return {
            async query() { return { rows: scenario.rows }; },
            release() { releases += 1; },
          };
        },
      },
      seedOrder: assert.fail,
      propagateByes: assert.fail,
    });
    const response = createResponse();
    await controller.generateBracket({ params: { id: "9" } }, response);
    assert.equal(response.statusCode, scenario.statusCode);
    assert.deepEqual(response.body, scenario.body);
    assert.equal(releases, 1);
  }
});

test("bracket generation controller preserves rollback, release, and error response", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(["query", sql]);
      if (sql === "ROLLBACK") return { rows: [] };
      throw new Error("database unavailable");
    },
    release() { calls.push(["release"]); },
  };
  const controller = createAdminTournamentBracketGenerationController({
    pool: { async connect() { return client; } },
    seedOrder: assert.fail,
    propagateByes: assert.fail,
  });
  const response = createResponse();
  const originalError = console.error;
  console.error = (...args) => calls.push(["error", ...args]);
  try {
    await controller.generateBracket({ params: { id: "9" } }, response);
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(calls, [
    ["query", "SELECT * FROM tournaments WHERE id = $1"],
    ["query", "ROLLBACK"],
    ["release"],
    ["error", "Setka generatsiya xatosi:", "database unavailable"],
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi: database unavailable" });
});

test("bracket generation preserves connection failure outside handler catch", async () => {
  const connectionError = new Error("connection unavailable");
  const controller = createAdminTournamentBracketGenerationController({
    pool: { async connect() { throw connectionError; } },
    seedOrder: assert.fail,
    propagateByes: assert.fail,
  });

  await assert.rejects(
    controller.generateBracket({ params: { id: "9" } }, createResponse()),
    connectionError
  );
});

test("bracket generation route preserves path and admin middleware order", () => {
  const router = adminTournamentBracketGenerationRoutes({
    pool: {},
    seedOrder() {},
    propagateByes() {},
  });
  const route = router.stack[0].route;

  assert.equal(route.path, "/admin/tournaments/:id/generate-bracket");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, requireAdmin);
  assert.equal(route.stack.length, 2);
});
