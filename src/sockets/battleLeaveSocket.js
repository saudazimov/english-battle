const MAX_ROOM_ID_LENGTH = 256;

function hasOwn(record, key) {
  return record !== null
    && typeof record === "object"
    && Object.prototype.hasOwnProperty.call(record, key);
}

function createBattleLeaveHandler({
  socket,
  battles,
  userToRoom,
  emitTeamProgress,
  checkTeamFinish,
  finishBattle,
  logger,
}) {
  return function battleLeave(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

    const { roomId } = payload;
    if (
      typeof roomId !== "string"
      || roomId.length === 0
      || roomId.length > MAX_ROOM_ID_LENGTH
      || !hasOwn(battles, roomId)
    ) return;

    const battle = battles[roomId];
    if (!battle || !hasOwn(battle.players, socket.id)) return;

    const leaver = battle.players[socket.id];
    if (!leaver || typeof leaver !== "object" || Array.isArray(leaver)) return;
    const leaverUserId = leaver.userId;
    leaver.finished = true;
    leaver.disconnected = true;

    if (
      leaverUserId
      && hasOwn(userToRoom, leaverUserId)
      && userToRoom[leaverUserId] === roomId
    ) {
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
