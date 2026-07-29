const registerBattleAnswerSocket = require("./battleAnswerSocket");
const registerBattleReconnectSocket = require("./battleReconnectSocket");
const registerBattleLeaveSocket = require("./battleLeaveSocket");

const defaultSocketRegistrars = {
  answer: registerBattleAnswerSocket,
  reconnect: registerBattleReconnectSocket,
  leave: registerBattleLeaveSocket,
};

function registerBattleLifecycleSocket({
  socket,
  pool,
  battles,
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
  socketRegistrars.answer({
    socket, pool, battles, saveBattleSession, finishBattle,
    timePerQuestionMs, answerGraceMs, logger,
  });
  socketRegistrars.reconnect({
    socket, pool, battles, userToRoom, recentlyFinished,
    finishBattleSession, rebindPlayerSocket, logger,
  });
  socketRegistrars.leave({
    socket, battles, userToRoom, emitTeamProgress,
    checkTeamFinish, finishBattle, logger,
  });
}

module.exports = registerBattleLifecycleSocket;
