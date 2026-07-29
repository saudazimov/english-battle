const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const {
  createTournamentMatchPlayerCheckinService,
} = require("../src/services/tournamentMatchPlayerCheckinService");
const {
  createTournamentMatchPlayerCheckinController,
} = require("../src/controllers/tournamentMatchPlayerCheckinController");
const tournamentMatchPlayerCheckinRoutes = require("../src/routes/tournamentMatchPlayerCheckinRoutes");

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

test("player check-in preserves successful transaction, SQL, and notification", async () => {
  const calls = [];
  const notifications = [];
  const client = createClient([
    { rows: [] },
    { rows: [{ status: "checkin", team_size: 2 }] },
    { rows: [{ id: 8, school_key: "school-one", checked_in: false }] },
    { rows: [{ c: "1" }] },
    { rows: [] },
    { rows: [] },
  ], calls);
  const service = createTournamentMatchPlayerCheckinService({
    notifyMatchPlayers(...args) {
      notifications.push(args);
    },
  });

  assert.deepEqual(await service.checkIn(client, "7", 11), { status: "checked-in" });
  assert.deepEqual(calls.map((call) => call[1]), [
    undefined,
    ["7"],
    ["7", 11],
    ["7", "school-one"],
    ["7", 11],
    undefined,
  ]);
  assert.equal(calls[0][0], "BEGIN");
  assert.match(calls[1][0], /FOR UPDATE OF m$/);
  assert.equal(calls[4][0], "UPDATE tournament_match_players SET checked_in = true, checked_in_at = NOW() WHERE match_id = $1 AND user_id = $2");
  assert.equal(calls[5][0], "COMMIT");
  assert.deepEqual(notifications, [["7", "checkinUpdate", { matchId: 7, userId: 11 }]]);
});

test("player check-in preserves all early response transaction outcomes", async () => {
  const fixtures = [
    [[{ rows: [] }, { rows: [] }], { status: "not-found" }, "ROLLBACK"],
    [[{ rows: [] }, { rows: [{ status: "pending", team_size: 2 }] }, { rows: [] }], { status: "not-open", matchStatus: "pending" }, "ROLLBACK"],
    [[{ rows: [] }, { rows: [{ status: "checkin", team_size: 2 }] }, { rows: [] }, { rows: [] }], { status: "not-participant" }, "ROLLBACK"],
    [[{ rows: [] }, { rows: [{ status: "checkin", team_size: 2 }] }, { rows: [{ checked_in: true }] }, { rows: [] }], { status: "checked-in" }, "COMMIT"],
    [[{ rows: [] }, { rows: [{ status: "checkin", team_size: 2 }] }, { rows: [{ school_key: "one", checked_in: false }] }, { rows: [{ c: "2" }] }, { rows: [] }], { status: "team-full" }, "ROLLBACK"],
  ];

  for (const [responses, expected, finalQuery] of fixtures) {
    const calls = [];
    const service = createTournamentMatchPlayerCheckinService({
      notifyMatchPlayers: assert.fail,
    });
    assert.deepEqual(await service.checkIn(createClient(responses, calls), "7", 11), expected);
    assert.equal(calls.at(-1)[0], finalQuery);
  }
});

test("player check-in controller preserves responses, rollback, logging, and release", async () => {
  const calls = [];
  const controller = createTournamentMatchPlayerCheckinController({
    pool: {
      async connect() {
        return createClient([{ rows: [] }, new Error("database unavailable"), { rows: [] }], calls);
      },
    },
    notifyMatchPlayers: assert.fail,
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.checkIn({ params: { id: "7" }, user: { id: 11 } }, response);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Checkin xatosi:", "database unavailable"]]);
  assert.deepEqual(calls.slice(-2), [["ROLLBACK", undefined], ["release"]]);
});

test("player check-in preserves pool connection error propagation", async () => {
  const controller = createTournamentMatchPlayerCheckinController({
    pool: { async connect() { throw new Error("connect failed"); } },
    notifyMatchPlayers: assert.fail,
  });

  await assert.rejects(
    controller.checkIn({ params: { id: "7" }, user: { id: 11 } }, createResponse()),
    { message: "connect failed" }
  );
});

test("player check-in route preserves path and middleware order", () => {
  const router = tournamentMatchPlayerCheckinRoutes({
    pool: { connect: assert.fail },
    notifyMatchPlayers: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/tournament/match/:id/checkin");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
