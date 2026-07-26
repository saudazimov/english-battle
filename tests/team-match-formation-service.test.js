const test = require("node:test");
const assert = require("node:assert/strict");

const { createTeamMatchFormationService } = require("../src/services/teamMatchFormationService");

function createHarness(teamMatchPool, teamMatchTimers = {}) {
  const calls = [];
  const tryFormTeamMatch = createTeamMatchFormationService({
    teamMatchPool,
    teamMatchTimers,
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
  return { calls, teamMatchPool, teamMatchTimers, tryFormTeamMatch };
}

function solo(id, playerId = id) {
  return { id, type: "solo", size: 1, players: [{ id: playerId }] };
}

test("team match formation preserves empty-pool early return", () => {
  const pool = { duo: [] };
  const harness = createHarness(pool, { duo: "timer" });

  assert.equal(harness.tryFormTeamMatch("duo"), false);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.teamMatchTimers, { duo: "timer" });
});

test("team match formation leaves original pool unchanged when second team is incomplete", () => {
  const entries = [solo("solo-1"), solo("solo-2"), solo("solo-3")];
  const pool = { duo: entries };
  const harness = createHarness(pool, { duo: "timer" });

  assert.equal(harness.tryFormTeamMatch("duo"), false);
  assert.equal(harness.teamMatchPool.duo, entries);
  assert.deepEqual(harness.teamMatchPool.duo, [entries[0], entries[1], entries[2]]);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.teamMatchTimers, { duo: "timer" });
});

test("team match formation prioritizes intact parties and keeps leftover entries", () => {
  const soloA = solo("solo-a");
  const partyPlayers = [{ id: "party-1" }, { id: "party-2" }];
  const party = { id: "party", type: "party", size: 2, players: partyPlayers };
  const soloB = solo("solo-b");
  const leftover = { id: "large-party", type: "party", size: 3, players: [{}, {}, {}] };
  const pool = { duo: [soloA, party, soloB, leftover] };
  const harness = createHarness(pool, { duo: "timer" });

  assert.equal(harness.tryFormTeamMatch("duo"), true);

  assert.deepEqual(harness.teamMatchPool.duo, [leftover]);
  assert.deepEqual(harness.teamMatchTimers, { duo: "timer" });
  assert.equal(harness.calls.some((call) => call[0] === "clearTimeout"), false);
  const startCall = harness.calls.find((call) => call[0] === "start");
  assert.deepEqual(startCall, [
    "start",
    partyPlayers.concat(soloA.players, soloB.players),
    "duo",
    2,
  ]);
});

test("team match formation clears timer when all entries are consumed", () => {
  const pool = { duo: [solo("a"), solo("b"), solo("c"), solo("d")] };
  const harness = createHarness(pool, { duo: "timer" });

  assert.equal(harness.tryFormTeamMatch("duo"), true);

  assert.deepEqual(harness.teamMatchPool.duo, []);
  assert.deepEqual(harness.teamMatchTimers, {});
  assert.deepEqual(harness.calls.map((call) => call[0]), ["clearTimeout", "log", "start"]);
  assert.deepEqual(harness.calls[0], ["clearTimeout", "timer"]);
  assert.deepEqual(harness.calls[1], [
    "log",
    "Jamoa match topildi [duo]: A=2 B=2 (haqiqiy o'yinchilar)",
  ]);
});

test("team match formation preserves invalid-mode failure", () => {
  const harness = createHarness({ duo: [], squad: [] });

  assert.throws(() => harness.tryFormTeamMatch("invalid"), TypeError);
  assert.deepEqual(harness.calls, []);
});
