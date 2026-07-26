const test = require("node:test");
const assert = require("node:assert/strict");

const { createLegacyTeamBotFillService } = require("../src/services/legacyTeamBotFillService");

function createHarness({ teamQueues, teamQueueTimers = {}, startError } = {}) {
  const calls = [];
  let nowValue = 1700000000000;
  const fillTeamWithBots = createLegacyTeamBotFillService({
    teamQueues,
    teamQueueTimers,
    startTeamBattle(group, teamMode, teamSize) {
      calls.push(["start", group, teamMode, teamSize]);
      if (startError) throw startError;
    },
    logger: {
      log(...args) { calls.push(["log", ...args]); },
      error(...args) { calls.push(["error", ...args]); },
    },
    random: () => 0,
    now: () => nowValue++,
    clearTimeoutFn(timer) {
      calls.push(["clearTimeout", timer]);
    },
  });
  return { calls, fillTeamWithBots, teamQueueTimers };
}

test("legacy team bot fill preserves empty-queue early return", () => {
  const teamQueues = { duo: [] };
  const harness = createHarness({ teamQueues, teamQueueTimers: { duo: "timer" } });

  assert.equal(harness.fillTeamWithBots("duo", 2, 4), undefined);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.teamQueueTimers, { duo: "timer" });
});

test("legacy team bot fill drains queue and preserves bot defaults", () => {
  const realPlayer = { socketId: "real", level: "B1", lengthKey: "quick" };
  const teamQueues = { duo: [realPlayer] };
  const harness = createHarness({ teamQueues, teamQueueTimers: { duo: "timer" } });

  harness.fillTeamWithBots("duo", 2, 4);

  assert.deepEqual(teamQueues.duo, []);
  assert.deepEqual(harness.calls.map((call) => call[0]), ["log", "clearTimeout", "start"]);
  assert.deepEqual(harness.calls[1], ["clearTimeout", "timer"]);
  assert.deepEqual(harness.teamQueueTimers, {});

  const startCall = harness.calls[2];
  assert.equal(startCall[2], "duo");
  assert.equal(startCall[3], 2);
  assert.equal(startCall[1][0], realPlayer);
  assert.deepEqual(startCall[1].slice(1), [
    {
      socketId: "tbot_duo_1700000000000_0",
      userId: null,
      name: "Sardor",
      level: "B1",
      lengthKey: "quick",
      rating: 1000,
      isBot: true,
    },
    {
      socketId: "tbot_duo_1700000000001_1",
      userId: null,
      name: "Sardor",
      level: "B1",
      lengthKey: "quick",
      rating: 1000,
      isBot: true,
    },
    {
      socketId: "tbot_duo_1700000000002_2",
      userId: null,
      name: "Sardor",
      level: "B1",
      lengthKey: "quick",
      rating: 1000,
      isBot: true,
    },
  ]);
});

test("legacy team bot fill preserves fallback player defaults", () => {
  const teamQueues = { squad: [{}] };
  const harness = createHarness({ teamQueues });

  harness.fillTeamWithBots("squad", 4, 2);

  const bot = harness.calls.find((call) => call[0] === "start")[1][1];
  assert.equal(bot.level, undefined);
  assert.equal(bot.lengthKey, undefined);
});

test("legacy team bot fill preserves caught-error logging", () => {
  const harness = createHarness({ teamQueues: {} });

  assert.equal(harness.fillTeamWithBots("duo", 2, 4), undefined);
  assert.deepEqual(harness.calls, [
    ["error", "fillTeamWithBots xatosi:", "Cannot read properties of undefined (reading 'length')"],
  ]);
});
