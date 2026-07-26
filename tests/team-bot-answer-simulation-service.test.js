const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTeamBotAnswerSimulationService,
} = require("../src/services/teamBotAnswerSimulationService");

function createHarness({ battles, randomValues = [] }) {
  const calls = [];
  const timers = [];
  const values = randomValues.slice();
  const simulateTeamBotAnswers = createTeamBotAnswerSimulationService({
    battles,
    emitTeamProgress(roomId) {
      calls.push(["progress", roomId]);
    },
    checkTeamFinish(roomId) {
      calls.push(["finishCheck", roomId]);
    },
    random() {
      const value = values.shift();
      calls.push(["random", value]);
      return value;
    },
    setTimeoutFn(callback, delay) {
      calls.push(["timer", delay]);
      timers.push(callback);
    },
  });
  return {
    calls,
    runNextTimer: () => timers.shift()(),
    simulateTeamBotAnswers,
    timers,
  };
}

function bot(overrides = {}) {
  return { score: 0, answeredCount: 0, finished: false, ...overrides };
}

test("team bot simulation preserves initial randomized delay", () => {
  const player = bot();
  const harness = createHarness({
    battles: { room_1: { players: { bot_1: player } } },
    randomValues: [0.5],
  });

  assert.equal(harness.simulateTeamBotAnswers("room_1", "bot_1", [{}]), undefined);

  assert.deepEqual(harness.calls, [["random", 0.5], ["timer", 3750]]);
  assert.equal(harness.timers.length, 1);
  assert.deepEqual(player, bot());
});

test("team bot simulation stops when battle or bot is unavailable", () => {
  const harness = createHarness({ battles: {}, randomValues: [0] });

  harness.simulateTeamBotAnswers("missing", "bot_1", [{}]);
  harness.runNextTimer();

  assert.deepEqual(harness.calls, [["random", 0], ["timer", 2000]]);
  assert.equal(harness.timers.length, 0);
});

test("team bot simulation preserves correct answer and completion order", () => {
  const player = bot();
  let questionReads = 0;
  const questions = new Proxy([{}], {
    get(target, property) {
      if (property === "0") questionReads++;
      return target[property];
    },
  });
  const harness = createHarness({
    battles: { room_1: { players: { bot_1: player } } },
    randomValues: [0, 0.67],
  });

  harness.simulateTeamBotAnswers("room_1", "bot_1", questions);
  harness.runNextTimer();

  assert.equal(questionReads, 1);
  assert.deepEqual(player, { score: 1, answeredCount: 1, finished: true });
  assert.deepEqual(harness.calls.slice(-3), [
    ["random", 0.67],
    ["progress", "room_1"],
    ["finishCheck", "room_1"],
  ]);
  assert.equal(harness.timers.length, 0);
});

test("team bot simulation preserves recursive delay and incorrect answer", () => {
  const player = bot();
  const harness = createHarness({
    battles: { room_2: { players: { bot_2: player } } },
    randomValues: [0, 0.9, 0.5, 0.1],
  });

  harness.simulateTeamBotAnswers("room_2", "bot_2", [{}, {}]);
  harness.runNextTimer();

  assert.deepEqual(player, { score: 0, answeredCount: 1, finished: false });
  assert.equal(harness.timers.length, 1);
  assert.ok(harness.calls.some((call) => call[0] === "timer" && call[1] === 3750));

  harness.runNextTimer();
  assert.deepEqual(player, { score: 1, answeredCount: 2, finished: true });
  assert.deepEqual(harness.calls.slice(-2), [
    ["progress", "room_2"],
    ["finishCheck", "room_2"],
  ]);
});

test("team bot simulation preserves empty-question completion", () => {
  const player = bot();
  const harness = createHarness({
    battles: { empty: { players: { bot: player } } },
    randomValues: [0],
  });

  harness.simulateTeamBotAnswers("empty", "bot", []);
  harness.runNextTimer();

  assert.deepEqual(player, { score: 0, answeredCount: 0, finished: true });
  assert.deepEqual(harness.calls.slice(-2), [
    ["progress", "empty"],
    ["finishCheck", "empty"],
  ]);
});
