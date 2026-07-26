const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMatchmakingQueueMatchService,
} = require("../src/services/matchmakingQueueMatchService");

function createHarness(waitingQueue, compatible = () => true) {
  const calls = [];
  const tryQueueMatch = createMatchmakingQueueMatchService({
    waitingQueue,
    mmCompatible(entry, player) {
      calls.push(["compatible", entry, player]);
      return compatible(entry, player);
    },
    removeFromQueue(socketId) {
      calls.push(["remove", socketId]);
    },
    pairPlayers(opponent, player) {
      calls.push(["pair", opponent, player]);
      return Promise.resolve("ignored-result");
    },
  });
  return { calls, tryQueueMatch };
}

test("queue match preserves missing-player early return", () => {
  const harness = createHarness([{ socketId: "other", userId: 2 }]);

  assert.equal(harness.tryQueueMatch("missing"), false);
  assert.deepEqual(harness.calls, []);
});

test("queue match skips same socket and equivalent string user IDs before compatibility", () => {
  const player = { socketId: "me", userId: 7 };
  const sameUser = { socketId: "same-user", userId: "7" };
  const incompatible = { socketId: "incompatible", userId: 8 };
  const opponent = { socketId: "opponent", userId: 9 };
  const laterOpponent = { socketId: "later", userId: 10 };
  const harness = createHarness(
    [player, sameUser, incompatible, opponent, laterOpponent],
    (entry) => entry !== incompatible
  );

  assert.equal(harness.tryQueueMatch("me"), true);

  const compatibilityCalls = harness.calls.filter((call) => call[0] === "compatible");
  assert.deepEqual(compatibilityCalls.map((call) => call[1]), [incompatible, opponent]);
  assert.deepEqual(harness.calls.slice(-3), [
    ["remove", "me"],
    ["remove", "opponent"],
    ["pair", opponent, player],
  ]);
});

test("queue match preserves no-compatible-opponent result", () => {
  const player = { socketId: "me", userId: 1 };
  const candidate = { socketId: "candidate", userId: 2 };
  const harness = createHarness([player, candidate], () => false);

  assert.equal(harness.tryQueueMatch("me"), false);
  assert.deepEqual(harness.calls, [["compatible", candidate, player]]);
});

test("queue match preserves ignored pair promise and synchronous true return", () => {
  const player = { socketId: "me", userId: 1 };
  const opponent = { socketId: "opponent", userId: 2 };
  const harness = createHarness([player, opponent]);

  const result = harness.tryQueueMatch("me");

  assert.equal(result, true);
  assert.equal(result instanceof Promise, false);
});
