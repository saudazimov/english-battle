const test = require("node:test");
const assert = require("node:assert/strict");

const registerTeamBattleSocket = require("../src/sockets/teamBattleSocket");

test("team battle socket preserves registration order and dependencies", () => {
  const calls = [];
  const dependencies = {
    socket: {}, io: {}, pool: {}, battles: {}, teamMatchPool: {},
    addTeamEntry: () => {}, emitTeamQueueStatus: () => {},
    stripUnsafe: () => {}, emitTeamProgress: () => {},
    checkTeamFinish: () => {}, timePerQuestionMs: 15000,
    answerGraceMs: 1000, logger: {},
  };
  const socketRegistrars = {
    matchmaking(value) { calls.push(["matchmaking", value]); },
    answer(value) { calls.push(["answer", value]); },
  };

  registerTeamBattleSocket({ ...dependencies, socketRegistrars });

  assert.deepEqual(calls, [
    ["matchmaking", {
      socket: dependencies.socket,
      io: dependencies.io,
      pool: dependencies.pool,
      teamMatchPool: dependencies.teamMatchPool,
      addTeamEntry: dependencies.addTeamEntry,
      emitTeamQueueStatus: dependencies.emitTeamQueueStatus,
      stripUnsafe: dependencies.stripUnsafe,
      logger: dependencies.logger,
    }],
    ["answer", {
      socket: dependencies.socket,
      io: dependencies.io,
      pool: dependencies.pool,
      battles: dependencies.battles,
      emitTeamProgress: dependencies.emitTeamProgress,
      checkTeamFinish: dependencies.checkTeamFinish,
      timePerQuestionMs: dependencies.timePerQuestionMs,
      answerGraceMs: dependencies.answerGraceMs,
      logger: dependencies.logger,
    }],
  ]);
});
