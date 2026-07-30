const test = require("node:test");
const assert = require("node:assert/strict");
const registerSoloMatchmakingSocket = require("../src/sockets/soloMatchmakingSocket");

function createHarness({ immediateMatch = false, initialQueue = [], nowValue = 123456 } = {}) {
  const calls = [];
  const listeners = [];
  const timers = [];
  const waitingQueue = initialQueue;
  const socket = {
    id: "socket-5",
    userId: 5,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    emit(...args) {
      calls.push(["emit", ...args]);
    },
    join(roomId) {
      calls.push(["join", roomId]);
    },
  };
  registerSoloMatchmakingSocket({
    socket,
    waitingQueue,
    removeFromQueue(socketId) {
      calls.push(["remove", socketId]);
      const index = waitingQueue.findIndex((entry) => entry.socketId === socketId);
      if (index < 0) return null;
      return waitingQueue.splice(index, 1)[0];
    },
    tryQueueMatch(socketId) {
      calls.push(["tryMatch", socketId]);
      return immediateMatch;
    },
    stripUnsafe(value, limit) {
      calls.push(["strip", value, limit]);
      return typeof value === "string" ? value.trim() : "";
    },
    getRandomBotName() {
      calls.push(["botName"]);
      return "Bot Kamol";
    },
    startBotBattle(roomId, player) {
      calls.push(["startBotBattle", roomId, player]);
    },
    setTimer(callback, delay) {
      const timer = { callback, delay, id: "timer-" + (timers.length + 1) };
      timers.push(timer);
      calls.push(["timer", delay, timer.id]);
      return timer.id;
    },
    now() {
      calls.push(["now"]);
      return nowValue;
    },
    logger: {
      log(...args) {
        calls.push(["log", ...args]);
      },
    },
  });
  return {
    calls,
    listeners,
    timers,
    waitingQueue,
    handlers: Object.fromEntries(
      listeners.map(({ event, handler }) => [event, handler])
    ),
  };
}

test("solo matchmaking preserves listener registration order", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "findMatch",
    "cancelMatch",
  ]);
});

test("immediate match preserves player normalization and short circuit", async () => {
  const harness = createHarness({ immediateMatch: true });

  await harness.handlers.findMatch({
    name: " Ali ",
    level: "B1",
    rating: 1450,
    mode: "casual",
    lengthKey: "quick",
  });

  assert.deepEqual(harness.calls, [
    ["log", "Jang qidirilyapti:", "socket-5"],
    ["remove", "socket-5"],
    ["strip", " Ali ", 60],
    ["now"],
    ["botName"],
    ["tryMatch", "socket-5"],
  ]);
  assert.deepEqual(harness.waitingQueue, [{
    socketId: "socket-5",
    userId: 5,
    name: "Ali",
    level: "B1",
    rating: 1450,
    mode: "casual",
    lengthKey: "quick",
    joinedAt: 123456,
    botName: "Bot Kamol",
  }]);
  assert.equal(harness.timers.length, 0);
});

test("waiting search preserves defaults, emits, and timer schedule", async () => {
  const harness = createHarness();

  await harness.handlers.findMatch(null);

  assert.deepEqual(harness.calls, [
    ["log", "Jang qidirilyapti:", "socket-5"],
    ["remove", "socket-5"],
    ["strip", undefined, 60],
    ["now"],
    ["botName"],
    ["tryMatch", "socket-5"],
    ["emit", "waiting", { message: "Raqib qidirilmoqda...", elapsedMs: 0 }],
    ["emit", "matchmaking:searching", { message: "Raqib qidirilmoqda...", elapsedMs: 0 }],
    ["timer", 20000, "timer-1"],
    ["timer", 45000, "timer-2"],
    ["timer", 20000, "timer-3"],
  ]);
  assert.deepEqual(harness.waitingQueue[0], {
    socketId: "socket-5",
    userId: 5,
    name: "O'yinchi",
    level: "A1",
    rating: 1000,
    mode: "ranked",
    lengthKey: "standard",
    joinedAt: 123456,
    botName: "Bot Kamol",
    expandTimers: ["timer-1", "timer-2"],
    botTimer: "timer-3",
  });
});

test("refresh resumes the original queue time and remaining timers", async () => {
  const original = {
    socketId: "socket-old",
    userId: 5,
    name: "Ali",
    level: "B1",
    rating: 1450,
    mode: "casual",
    lengthKey: "extended",
    joinedAt: 100000,
    botName: "Bot Kamol",
    disconnected: true,
  };
  const harness = createHarness({ initialQueue: [original], nowValue: 112000 });

  await harness.handlers.findMatch({ name: "Changed", mode: "ranked", lengthKey: "quick" });

  assert.equal(harness.waitingQueue.length, 1);
  assert.deepEqual(harness.waitingQueue[0], {
    socketId: "socket-5",
    userId: 5,
    name: "Ali",
    level: "B1",
    rating: 1450,
    mode: "casual",
    lengthKey: "extended",
    joinedAt: 100000,
    botName: "Bot Kamol",
    expandTimers: ["timer-1", "timer-2"],
    botTimer: "timer-3",
  });
  assert.deepEqual(harness.timers.map((timer) => timer.delay), [8000, 33000, 8000]);
  assert.ok(harness.calls.some((call) =>
    call[0] === "emit" && call[1] === "waiting" && call[2].elapsedMs === 12000
  ));
});

test("expansion timers preserve queue check, windows, and retry", async () => {
  const harness = createHarness();
  await harness.handlers.findMatch({ name: "Ali" });
  harness.calls.length = 0;

  harness.timers[0].callback();
  harness.timers[1].callback();

  assert.deepEqual(harness.calls, [
    ["emit", "matchmaking:expanded", { window: 150 }],
    ["tryMatch", "socket-5"],
    ["emit", "matchmaking:expanded", { window: 200 }],
    ["tryMatch", "socket-5"],
  ]);

  harness.waitingQueue.length = 0;
  harness.calls.length = 0;
  harness.timers[0].callback();
  assert.deepEqual(harness.calls, []);
});

test("bot fallback preserves removal, payloads, and delayed start", async () => {
  const harness = createHarness();
  await harness.handlers.findMatch({ name: "Ali", level: "A2" });
  const player = harness.waitingQueue[0];
  harness.calls.length = 0;

  harness.timers[2].callback();

  const roomId = "battle_bot_socket-5";
  const botFound = {
    roomId,
    opponent: {
      name: "Bot Kamol",
      isBot: true,
      rating: null,
      win_rate: null,
      level: "A2",
    },
    message: "Mashqlovchi raqib topildi",
  };
  assert.deepEqual(harness.calls, [
    ["remove", "socket-5"],
    ["join", roomId],
    ["emit", "matchFound", botFound],
    ["emit", "matchmaking:found", botFound],
    ["timer", 6000, "timer-4"],
  ]);

  harness.timers[3].callback();
  assert.deepEqual(harness.calls.at(-1), ["startBotBattle", roomId, player]);
});

test("bot fallback preserves silent return after an existing match", async () => {
  const harness = createHarness();
  await harness.handlers.findMatch({ name: "Ali" });
  harness.waitingQueue.length = 0;
  harness.calls.length = 0;

  harness.timers[2].callback();

  assert.deepEqual(harness.calls, [["remove", "socket-5"]]);
});

test("cancel match preserves queue removal and response", () => {
  const harness = createHarness();

  harness.handlers.cancelMatch();

  assert.deepEqual(harness.calls, [
    ["remove", "socket-5"],
    ["emit", "matchmaking:cancelled", {}],
  ]);
});
