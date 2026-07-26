const test = require("node:test");
const assert = require("node:assert/strict");

const { createTeamMatchBotFillService } = require("../src/services/teamMatchBotFillService");

function createHarness(teamMatchPool, teamMatchTimers = {}) {
  const calls = [];
  const botFillTeamMatch = createTeamMatchBotFillService({
    teamMatchPool,
    teamMatchTimers,
    makeTeamBot(referencePlayer, index) {
      const bot = { bot: index, referencePlayer };
      calls.push(["makeBot", referencePlayer, index, bot]);
      return bot;
    },
    startTeamBattle(group, mode, teamSize) {
      calls.push(["start", group, mode, teamSize]);
    },
    logger: {
      log(...args) { calls.push(["log", ...args]); },
    },
    clearTimeoutFn(timer) {
      calls.push(["clearTimeout", timer]);
    },
  });
  return { botFillTeamMatch, calls, teamMatchPool, teamMatchTimers };
}

test("team match bot fill preserves empty-pool early return", () => {
  const pool = { duo: [] };
  const harness = createHarness(pool, { duo: "timer" });

  assert.equal(harness.botFillTeamMatch("duo"), undefined);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.teamMatchTimers, { duo: "timer" });
});

test("team match bot fill clears pool and timer before filling both teams", () => {
  const realPlayer = { id: "real", level: "B1" };
  const originalPool = [{ id: "solo", type: "solo", size: 1, players: [realPlayer] }];
  const pool = { duo: originalPool };
  const harness = createHarness(pool, { duo: "timer" });

  harness.botFillTeamMatch("duo");

  assert.notEqual(harness.teamMatchPool.duo, originalPool);
  assert.deepEqual(harness.teamMatchPool.duo, []);
  assert.deepEqual(harness.teamMatchTimers, {});
  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "clearTimeout", "makeBot", "makeBot", "makeBot", "log", "start",
  ]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "makeBot").map((call) => call.slice(1, 3)), [
    [realPlayer, 0],
    [realPlayer, 1],
    [realPlayer, 2],
  ]);
  assert.deepEqual(harness.calls.at(-1), [
    "start",
    [realPlayer, harness.calls[1][3], harness.calls[2][3], harness.calls[3][3]],
    "duo",
    2,
  ]);
});

test("team match bot fill preserves party-first then solo placement", () => {
  const soloPlayer = { id: "solo-player" };
  const partyPlayers = [{ id: "party-1" }, { id: "party-2" }];
  const pool = {
    squad: [
      { id: "solo", type: "solo", size: 1, players: [soloPlayer] },
      { id: "party", type: "party", size: 2, players: partyPlayers },
    ],
  };
  const harness = createHarness(pool);

  harness.botFillTeamMatch("squad");

  const startGroup = harness.calls.find((call) => call[0] === "start")[1];
  assert.deepEqual(startGroup.slice(0, 3), partyPlayers.concat(soloPlayer));
  assert.equal(startGroup.length, 8);
  assert.deepEqual(
    harness.calls.filter((call) => call[0] === "makeBot").map((call) => call[2]),
    [0, 1, 2, 3, 4]
  );
});

test("team match bot fill preserves invalid-mode failure", () => {
  const harness = createHarness({ duo: [], squad: [] });

  assert.throws(() => harness.botFillTeamMatch("invalid"), TypeError);
  assert.deepEqual(harness.calls, []);
});
