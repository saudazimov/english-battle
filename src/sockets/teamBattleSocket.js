const registerTeamMatchmakingSocket = require("./teamMatchmakingSocket");
const registerTeamBattleAnswerSocket = require("./teamBattleAnswerSocket");

const defaultSocketRegistrars = {
  matchmaking: registerTeamMatchmakingSocket,
  answer: registerTeamBattleAnswerSocket,
};

function registerTeamBattleSocket({
  socket,
  io,
  pool,
  battles,
  teamMatchPool,
  addTeamEntry,
  emitTeamQueueStatus,
  stripUnsafe,
  emitTeamProgress,
  checkTeamFinish,
  timePerQuestionMs,
  answerGraceMs,
  logger = console,
  socketRegistrars = defaultSocketRegistrars,
}) {
  socketRegistrars.matchmaking({
    socket, io, teamMatchPool, addTeamEntry,
    emitTeamQueueStatus, stripUnsafe, logger,
  });
  socketRegistrars.answer({
    socket, io, pool, battles, emitTeamProgress, checkTeamFinish,
    timePerQuestionMs, answerGraceMs, logger,
  });
}

module.exports = registerTeamBattleSocket;
