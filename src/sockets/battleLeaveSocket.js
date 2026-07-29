function createBattleLeaveHandler({
  socket,
  battles,
  userToRoom,
  emitTeamProgress,
  checkTeamFinish,
  finishBattle,
  logger,
}) {
  return function battleLeave({ roomId }) {
    const battle = roomId ? battles[roomId] : null;
    if (!battle) return;

    const leaverKey = battle.players[socket.id] ? socket.id : null;
    if (!leaverKey) return;

    const leaver = battle.players[leaverKey];
    const leaverUserId = leaver.userId;
    leaver.finished = true;
    leaver.disconnected = true;

    if (leaverUserId && userToRoom[leaverUserId] === roomId) {
      delete userToRoom[leaverUserId];
    }

    logger.log(
      "Leave: user " + leaverUserId + " jangni tark etdi → " + roomId
    );

    if (battle.isTeam) {
      socket.to(roomId).emit("playerOffline", {
        userId: String(leaverUserId),
      });
      emitTeamProgress(roomId);
      checkTeamFinish(roomId);
    } else {
      const allFinished = Object.values(battle.players).every(
        (player) => player.finished
      );
      if (allFinished) {
        finishBattle(roomId);
      } else {
        socket.to(roomId).emit("opponentLeft", {
          message: "Raqib jangni tark etdi",
        });
      }
    }
  };
}

function registerBattleLeaveSocket({
  socket,
  battles,
  userToRoom,
  emitTeamProgress,
  checkTeamFinish,
  finishBattle,
  logger = console,
}) {
  socket.on("battle:leave", createBattleLeaveHandler({
    socket,
    battles,
    userToRoom,
    emitTeamProgress,
    checkTeamFinish,
    finishBattle,
    logger,
  }));
}

module.exports = registerBattleLeaveSocket;
