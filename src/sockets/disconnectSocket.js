function hasOwn(record, key) {
  return record !== null
    && typeof record === "object"
    && Object.prototype.hasOwnProperty.call(record, key);
}

function getBattle(battles, roomId) {
  if (typeof roomId !== "string" && typeof roomId !== "number") return null;
  if (typeof roomId === "number" && !Number.isFinite(roomId)) return null;
  const roomKey = String(roomId);
  if (
    !roomKey
    || roomKey.length > 256
    || ["__proto__", "prototype", "constructor"].includes(roomKey)
    || !hasOwn(battles, roomKey)
  ) return null;
  const battle = battles[roomKey];
  if (!battle || typeof battle !== "object" || Array.isArray(battle)) {
    return null;
  }
  if (
    !hasOwn(battle, "players")
    || !battle.players
    || typeof battle.players !== "object"
    || Array.isArray(battle.players)
  ) return null;
  return battle;
}

function findPlayerKey(battle, userId) {
  return Object.keys(battle.players).find(function (key) {
    const player = battle.players[key];
    return player
      && typeof player === "object"
      && !Array.isArray(player)
      && String(player.userId) === String(userId);
  });
}

function createOfflineSignalCallback({
  socket,
  battles,
  userToRoom,
  userId,
  roomId,
  disconnectedSocketId,
}) {
  return function signalOffline() {
    const battle = getBattle(battles, roomId);
    if (!battle) return;
    if (!hasOwn(userToRoom, userId) || userToRoom[userId] !== roomId) return;
    const currentKey = findPlayerKey(battle, userId);
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
    const battle = getBattle(battles, roomId);
    if (!battle) return;
    if (!hasOwn(userToRoom, userId) || userToRoom[userId] !== roomId) return;
    const currentKey = findPlayerKey(battle, userId);
    if (!currentKey || currentKey !== disconnectedSocketId) return;

    const player = battle.players[currentKey];
    if (!hasOwn(player, "finished") || !player.finished) {
      player.finished = true;
      player.disconnected = true;
      if (hasOwn(battle, "isTeam") && battle.isTeam) {
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
          return item
            && typeof item === "object"
            && !Array.isArray(item)
            && hasOwn(item, "finished")
            && item.finished;
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
    const disconnectedUserId = socket.userId;
    const disconnectedSocketId = socket.id;
    var suspendedSearch = null;
    if (typeof removeFromQueue.suspend === "function") {
      suspendedSearch = removeFromQueue.suspend(socket.id);
    } else {
      removeFromQueue(socket.id);
    }
    if (suspendedSearch) {
      setTimer(function removeExpiredSearch() {
        removeFromQueue(disconnectedSocketId);
      }, 15000);
    }

    if (disconnectedUserId) {
      const roomId = hasOwn(userToRoom, disconnectedUserId)
        ? userToRoom[disconnectedUserId]
        : null;
      const battle = roomId ? getBattle(battles, roomId) : null;
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
      && hasOwn(onlineUsers, socket.userId)
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
