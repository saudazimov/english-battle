function createOfflineSignalCallback({
  socket,
  battles,
  userToRoom,
  userId,
  roomId,
  disconnectedSocketId,
}) {
  return function signalOffline() {
    const battle = battles[roomId];
    if (!battle) return;
    if (userToRoom[userId] !== roomId) return;
    const currentKey = Object.keys(battle.players).find(function (key) {
      return String(battle.players[key].userId) === String(userId);
    });
    if (!currentKey || currentKey !== disconnectedSocketId) return;
    socket.to(roomId).emit("playerOffline", { userId: String(userId) });
  };
}

function createForfeitCallback({
  socket,
  battles,
  userToRoom,
  userId,
  roomId,
  disconnectedSocketId,
  emitTeamProgress,
  checkTeamFinish,
  finishBattle,
  logger,
}) {
  return function forfeitDisconnectedPlayer() {
    const battle = battles[roomId];
    if (!battle) return;
    if (userToRoom[userId] !== roomId) return;
    const currentKey = Object.keys(battle.players).find(function (key) {
      return String(battle.players[key].userId) === String(userId);
    });
    if (!currentKey || currentKey !== disconnectedSocketId) return;

    const player = battle.players[currentKey];
    if (player && !player.finished) {
      player.finished = true;
      player.disconnected = true;
      if (battle.isTeam) {
        logger.log(
          "Jamoa jang: user " + userId
          + " qaytmadi (30s) → finished, jang davom etadi"
        );
        emitTeamProgress(roomId);
        checkTeamFinish(roomId);
      } else {
        logger.log(
          "1v1 jang: user " + userId
          + " qaytmadi (30s) → finished, jang yakunlanadi"
        );
        socket.to(roomId).emit("opponentLeft", {
          message: "Raqib jangdan chiqib ketdi",
        });
        const allDone = Object.values(battle.players).every(function (item) {
          return item.finished;
        });
        if (allDone) finishBattle(roomId);
      }
    }
  };
}

function createDisconnectHandler({
  socket,
  battles,
  userToRoom,
  onlineUsers,
  removeFromQueue,
  notifyFriendsStatus,
  removeFromParty,
  emitTeamProgress,
  checkTeamFinish,
  finishBattle,
  setTimer,
  logger,
}) {
  return function disconnect() {
    logger.log("O'yinchi uzildi:", socket.id);
    removeFromQueue(socket.id);

    const disconnectedUserId = socket.userId;
    const disconnectedSocketId = socket.id;
    if (disconnectedUserId) {
      const roomId = userToRoom[disconnectedUserId];
      const battle = roomId ? battles[roomId] : null;
      if (battle) {
        setTimer(createOfflineSignalCallback({
          socket,
          battles,
          userToRoom,
          userId: disconnectedUserId,
          roomId,
          disconnectedSocketId,
        }), 3000);
        setTimer(createForfeitCallback({
          socket,
          battles,
          userToRoom,
          userId: disconnectedUserId,
          roomId,
          disconnectedSocketId,
          emitTeamProgress,
          checkTeamFinish,
          finishBattle,
          logger,
        }), 30000);
      }
    }

    if (
      socket.userId
      && onlineUsers[socket.userId] === socket.id
    ) {
      delete onlineUsers[socket.userId];
      logger.log("Offlayn:", socket.userId);
      notifyFriendsStatus(socket.userId, false);
      removeFromParty(String(socket.userId));
    }
  };
}

function registerDisconnectSocket({
  socket,
  battles,
  userToRoom,
  onlineUsers,
  removeFromQueue,
  notifyFriendsStatus,
  removeFromParty,
  emitTeamProgress,
  checkTeamFinish,
  finishBattle,
  setTimer = setTimeout,
  logger = console,
}) {
  socket.on("disconnect", createDisconnectHandler({
    socket,
    battles,
    userToRoom,
    onlineUsers,
    removeFromQueue,
    notifyFriendsStatus,
    removeFromParty,
    emitTeamProgress,
    checkTeamFinish,
    finishBattle,
    setTimer,
    logger,
  }));
}

module.exports = registerDisconnectSocket;
