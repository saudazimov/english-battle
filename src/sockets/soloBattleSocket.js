const registerSoloMatchmakingSocket = require("./soloMatchmakingSocket");
const registerBattleLifecycleSocket = require("./battleLifecycleSocket");

const defaultSocketRegistrars = {
  matchmaking: registerSoloMatchmakingSocket,
  lifecycle: registerBattleLifecycleSocket,
};

function createSoloBattleSocket({
  socket,
  pool,
  battles,
  waitingQueue,
  removeFromQueue,
  tryQueueMatch,
  stripUnsafe,
  getRandomBotName,
  startBotBattle,
  saveBattleSession,
  finishBattle,
  timePerQuestionMs,
  answerGraceMs,
  userToRoom,
  recentlyFinished,
  finishBattleSession,
  rebindPlayerSocket,
  emitTeamProgress,
  checkTeamFinish,
  logger = console,
  socketRegistrars = defaultSocketRegistrars,
}) {
  function registerMatchmakingSocket() {
    socketRegistrars.matchmaking({
      socket, waitingQueue, removeFromQueue, tryQueueMatch,
      stripUnsafe, getRandomBotName, startBotBattle, logger,
    });
  }

  function registerLifecycleSocket() {
    socketRegistrars.lifecycle({
      socket, pool, battles, saveBattleSession, finishBattle,
      timePerQuestionMs, answerGraceMs, userToRoom, recentlyFinished,
      finishBattleSession, rebindPlayerSocket, emitTeamProgress,
      checkTeamFinish, logger,
    });
  }

  return { registerMatchmakingSocket, registerLifecycleSocket };
}

module.exports = { createSoloBattleSocket };
