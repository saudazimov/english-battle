const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createMatchmakingQueueRemovalService,
} = require("../src/services/matchmakingQueueRemovalService");

function createHarness(waitingQueue) {
  const clearedTimers = [];
  const removeFromQueue = createMatchmakingQueueRemovalService({
    waitingQueue,
    clearTimeoutFn(timer) {
      clearedTimers.push(timer);
    },
  });
  return { removeFromQueue, clearedTimers };
}

test("queue removal preserves missing-socket behavior", () => {
  const waitingQueue = [{ socketId: "socket-1", botTimer: "bot-1" }];
  const { removeFromQueue, clearedTimers } = createHarness(waitingQueue);

  assert.equal(removeFromQueue("missing"), null);
  assert.deepEqual(waitingQueue, [{ socketId: "socket-1", botTimer: "bot-1" }]);
  assert.deepEqual(clearedTimers, []);
});

test("queue removal clears timers in the original order and returns the same entry", () => {
  const target = {
    socketId: "socket-2",
    botTimer: "bot-timer",
    expandTimers: ["expand-1", "expand-2"],
  };
  const first = { socketId: "socket-1" };
  const last = { socketId: "socket-3" };
  const waitingQueue = [first, target, last];
  const { removeFromQueue, clearedTimers } = createHarness(waitingQueue);

  const removed = removeFromQueue("socket-2");

  assert.equal(removed, target);
  assert.deepEqual(clearedTimers, ["bot-timer", "expand-1", "expand-2"]);
  assert.deepEqual(waitingQueue, [first, last]);
});

test("queue removal preserves truthy timer checks", () => {
  const target = { socketId: "socket-1", botTimer: 0, expandTimers: [] };
  const waitingQueue = [target];
  const { removeFromQueue, clearedTimers } = createHarness(waitingQueue);

  assert.equal(removeFromQueue("socket-1"), target);
  assert.deepEqual(clearedTimers, []);
  assert.deepEqual(waitingQueue, []);
});

test("queue removal preserves first-match behavior for duplicate socket IDs", () => {
  const first = { socketId: "duplicate", name: "first" };
  const second = { socketId: "duplicate", name: "second" };
  const waitingQueue = [first, second];
  const { removeFromQueue } = createHarness(waitingQueue);

  assert.equal(removeFromQueue("duplicate"), first);
  assert.deepEqual(waitingQueue, [second]);
});
