function createTeamBattleCompletionCheckService({ battles, finishTeamBattle }) {
  return function checkTeamFinish(roomId) {
    const battle = battles[roomId];
    if (!battle || battle.finished) return;

    const allFinished = Object.keys(battle.players).every(
      (socketId) => battle.players[socketId].finished
    );
    if (allFinished) finishTeamBattle(roomId);
  };
}

module.exports = { createTeamBattleCompletionCheckService };
