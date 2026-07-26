const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createBattleBotAnswerSimulationService,
} = require("../src/services/battleBotAnswerSimulationService");

function createHarness({ battles, randomValues = [] }) {
  const calls = [];
  const timers = [];
  const values = randomValues.slice();
  const simulateBotAnswers = createBattleBotAnswerSimulationService({
    battles,
    io: {
      to(roomId) {
        return {
          emit(event, payload) {
            calls.push(["emit", roomId, event, payload]);
          },
        };
      },
    },
    finishBattle(roomId) {
      calls.push(["finish", roomId]);
      return Promise.resolve("ignored-result");
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
    simulateBotAnswers,
    timers,
  };
}

function bot(overrides = {}) {
  return { score: 0, answeredCount: 0, finished: false, isBot: true, ...overrides };
}

test("1v1 bot simulation preserves initial 2-5 second delay", () => {
  const player = bot();
  const harness = createHarness({
    battles: { room_1: { players: { bot_1: player } } },
    randomValues: [0.5],
  });

  assert.equal(harness.simulateBotAnswers("room_1", "bot_1", [{}]), undefined);
  assert.deepEqual(harness.calls, [["random", 0.5], ["timer", 3500]]);
  assert.deepEqual(player, bot());
});

test("1v1 bot simulation preserves missing battle and player guards", () => {
  const harness = createHarness({ battles: {}, randomValues: [0] });

  harness.simulateBotAnswers("missing", "bot", [{}]);
  harness.runNextTimer();

  assert.deepEqual(harness.calls, [["random", 0], ["timer", 2000]]);
  assert.equal(harness.timers.length, 0);
});

test("1v1 bot simulation preserves scoring, room progress, and finish order", () => {
  const player = bot();
  const human = { finished: true };
  let questionReads = 0;
  const questions = new Proxy([{}], {
    get(target, property) {
      if (property === "0") questionReads++;
      return target[property];
    },
  });
  const harness = createHarness({
    battles: { room_1: { players: { human, bot: player } } },
    randomValues: [0, 0.64],
  });

  harness.simulateBotAnswers("room_1", "bot", questions);
  harness.runNextTimer();

  assert.equal(questionReads, 1);
  assert.deepEqual(player, bot({ score: 1, answeredCount: 1, finished: true }));
  assert.deepEqual(harness.calls.slice(-3), [
    ["random", 0.64],
    ["emit", "room_1", "opponentProgress", { answeredCount: 1 }],
    ["finish", "room_1"],
  ]);
});

test("1v1 bot simulation preserves 3-8 second recursive delay", () => {
  const player = bot();
  const harness = createHarness({
    battles: { room_2: { players: { human: { finished: false }, bot: player } } },
    randomValues: [0, 0.9, 0.5, 0.1],
  });

  harness.simulateBotAnswers("room_2", "bot", [{}, {}]);
  harness.runNextTimer();

  assert.deepEqual(player, bot({ answeredCount: 1 }));
  assert.ok(harness.calls.some((call) => call[0] === "timer" && call[1] === 5500));
  harness.runNextTimer();
  assert.deepEqual(player, bot({ score: 1, answeredCount: 2, finished: true }));
  assert.equal(harness.calls.some((call) => call[0] === "finish"), false);
});

test("1v1 bot simulation preserves empty-question completion", () => {
  const player = bot();
  const harness = createHarness({
    battles: { empty: { players: { human: { finished: true }, bot: player } } },
    randomValues: [0],
  });

  harness.simulateBotAnswers("empty", "bot", []);
  harness.runNextTimer();

  assert.equal(player.finished, true);
  assert.deepEqual(harness.calls.at(-1), ["finish", "empty"]);
});

test("1v1 bot simulation preserves absence of finished-state guards", () => {
  const player = bot({ finished: true });
  const harness = createHarness({
    battles: { room_3: { finished: true, players: { human: { finished: false }, bot: player } } },
    randomValues: [0, 0.9],
  });

  harness.simulateBotAnswers("room_3", "bot", [{}]);
  harness.runNextTimer();

  assert.equal(player.answeredCount, 1);
  assert.deepEqual(harness.calls.at(-1), ["emit", "room_3", "opponentProgress", { answeredCount: 1 }]);
});
