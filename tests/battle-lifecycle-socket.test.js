const test = require("node:test");
const assert = require("node:assert/strict");

const registerBattleLifecycleSocket = require("../src/sockets/battleLifecycleSocket");

test("battle lifecycle socket preserves registration order and dependencies", () => {
  const calls = [];
  const dependencies = {
    socket: {}, pool: {}, battles: {}, saveBattleSession: () => {},
    finishBattle: () => {}, timePerQuestionMs: 15000, answerGraceMs: 1000,
    userToRoom: {}, recentlyFinished: {}, finishBattleSession: () => {},
    rebindPlayerSocket: () => {}, emitTeamProgress: () => {},
    checkTeamFinish: () => {}, logger: {},
  };
  const socketRegistrars = {
    answer(value) { calls.push(["answer", value]); },
    reconnect(value) { calls.push(["reconnect", value]); },
    leave(value) { calls.push(["leave", value]); },
  };

  registerBattleLifecycleSocket({
    ...dependencies,
    socketRegistrars,
  });

  assert.deepEqual(calls, [
    ["answer", {
      socket: dependencies.socket,
      pool: dependencies.pool,
      battles: dependencies.battles,
      saveBattleSession: dependencies.saveBattleSession,
      finishBattle: dependencies.finishBattle,
      timePerQuestionMs: dependencies.timePerQuestionMs,
      answerGraceMs: dependencies.answerGraceMs,
      logger: dependencies.logger,
    }],
    ["reconnect", {
      socket: dependencies.socket,
      pool: dependencies.pool,
      battles: dependencies.battles,
      userToRoom: dependencies.userToRoom,
      recentlyFinished: dependencies.recentlyFinished,
      finishBattleSession: dependencies.finishBattleSession,
      rebindPlayerSocket: dependencies.rebindPlayerSocket,
      logger: dependencies.logger,
    }],
    ["leave", {
      socket: dependencies.socket,
      battles: dependencies.battles,
      userToRoom: dependencies.userToRoom,
      emitTeamProgress: dependencies.emitTeamProgress,
      checkTeamFinish: dependencies.checkTeamFinish,
      finishBattle: dependencies.finishBattle,
      logger: dependencies.logger,
    }],
  ]);
});
