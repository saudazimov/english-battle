const test = require("node:test");
const assert = require("node:assert/strict");

const { createTeamMatchEntryService } = require("../src/services/teamMatchEntryService");

function createHarness({ formed, existingTimer } = {}) {
  const entry = { id: "entry-1" };
  const teamMatchPool = { duo: [] };
  const teamMatchTimers = {};
  if (existingTimer !== undefined) teamMatchTimers.duo = existingTimer;
  const calls = [];
  let timeoutCallback;
  const newTimer = { id: "new-timer" };
  const addTeamEntry = createTeamMatchEntryService({
    teamMatchPool,
    teamMatchTimers,
    emitTeamQueueStatus(mode) {
      calls.push(["emit", mode, teamMatchPool[mode].slice()]);
    },
    tryFormTeamMatch(mode) {
      calls.push(["tryForm", mode, teamMatchPool[mode].slice()]);
      return formed;
    },
    botFillTeamMatch(mode) {
      calls.push(["botFill", mode]);
    },
    setTimeoutFn(callback, delay) {
      calls.push(["setTimeout", delay]);
      timeoutCallback = callback;
      return newTimer;
    },
    clearTimeoutFn(timer) {
      calls.push(["clearTimeout", timer]);
    },
  });
  return {
    addTeamEntry,
    calls,
    entry,
    newTimer,
    runTimeout: () => timeoutCallback(),
    teamMatchPool,
    teamMatchTimers,
  };
}

test("team match entry preserves push, emit, and match-attempt order", () => {
  const harness = createHarness({ formed: true, existingTimer: "existing" });

  assert.equal(harness.addTeamEntry("duo", harness.entry), undefined);

  assert.deepEqual(harness.teamMatchPool.duo, [harness.entry]);
  assert.deepEqual(harness.calls, [
    ["emit", "duo", [harness.entry]],
    ["tryForm", "duo", [harness.entry]],
  ]);
  assert.equal(harness.teamMatchTimers.duo, "existing");
});

test("team match entry replaces an existing timer when no match forms", () => {
  const harness = createHarness({ formed: false, existingTimer: "old-timer" });

  harness.addTeamEntry("duo", harness.entry);

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "emit", "tryForm", "clearTimeout", "setTimeout",
  ]);
  assert.deepEqual(harness.calls[2], ["clearTimeout", "old-timer"]);
  assert.deepEqual(harness.calls[3], ["setTimeout", 15000]);
  assert.equal(harness.teamMatchTimers.duo, harness.newTimer);

  harness.runTimeout();
  assert.deepEqual(harness.calls.at(-1), ["botFill", "duo"]);
});

test("team match entry does not clear a missing timer", () => {
  const harness = createHarness({ formed: false });

  harness.addTeamEntry("duo", harness.entry);

  assert.equal(harness.calls.some((call) => call[0] === "clearTimeout"), false);
  assert.equal(harness.teamMatchTimers.duo, harness.newTimer);
});

test("team match entry preserves invalid-mode failure before side effects", () => {
  const harness = createHarness({ formed: false });

  assert.throws(() => harness.addTeamEntry("invalid", harness.entry), TypeError);
  assert.deepEqual(harness.calls, []);
});
