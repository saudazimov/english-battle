const test = require("node:test");
const assert = require("node:assert/strict");

const { createSoloBattleSocket } = require("../src/sockets/soloBattleSocket");

test("solo battle socket preserves phased order and dependencies", () => {
  const calls = [];
  const dependencies = {
    socket: {}, pool: {}, battles: {}, waitingQueue: [],
    removeFromQueue: () => {}, tryQueueMatch: () => {}, stripUnsafe: () => {},
    getRandomBotName: () => {}, startBotBattle: () => {},
    saveBattleSession: () => {}, finishBattle: () => {},
    timePerQuestionMs: 15000, answerGraceMs: 1000, userToRoom: {},
    recentlyFinished: {}, finishBattleSession: () => {},
    rebindPlayerSocket: () => {}, emitTeamProgress: () => {},
    checkTeamFinish: () => {}, logger: {},
  };
  const socketRegistrars = {
    matchmaking(value) { calls.push(["matchmaking", value]); },
    lifecycle(value) { calls.push(["lifecycle", value]); },
  };
  const soloBattleSocket = createSoloBattleSocket({
    ...dependencies,
    socketRegistrars,
  });

  soloBattleSocket.registerMatchmakingSocket();
  calls.push(["teamBattle"]);
  soloBattleSocket.registerLifecycleSocket();

  assert.deepEqual(calls, [
    ["matchmaking", {
      socket: dependencies.socket,
      waitingQueue: dependencies.waitingQueue,
      removeFromQueue: dependencies.removeFromQueue,
      tryQueueMatch: dependencies.tryQueueMatch,
      stripUnsafe: dependencies.stripUnsafe,
      getRandomBotName: dependencies.getRandomBotName,
      startBotBattle: dependencies.startBotBattle,
      logger: dependencies.logger,
    }],
    ["teamBattle"],
    ["lifecycle", {
      socket: dependencies.socket,
      pool: dependencies.pool,
      battles: dependencies.battles,
      saveBattleSession: dependencies.saveBattleSession,
      finishBattle: dependencies.finishBattle,
      timePerQuestionMs: dependencies.timePerQuestionMs,
      answerGraceMs: dependencies.answerGraceMs,
      userToRoom: dependencies.userToRoom,
      recentlyFinished: dependencies.recentlyFinished,
      finishBattleSession: dependencies.finishBattleSession,
      rebindPlayerSocket: dependencies.rebindPlayerSocket,
      emitTeamProgress: dependencies.emitTeamProgress,
      checkTeamFinish: dependencies.checkTeamFinish,
      logger: dependencies.logger,
    }],
  ]);
});
