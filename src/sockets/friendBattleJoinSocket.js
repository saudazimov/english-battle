function createJoinFriendBattleHandler({ socket, pendingBattles, startBattle }) {
  return function joinFriendBattle({ roomId, userId }) {
    userId = socket.userId;
    const pending = pendingBattles[roomId];
    if (!pending) return;

    const isExpectedPlayer = String(pending.player1.userId) === String(userId)
      || String(pending.player2.userId) === String(userId);
    if (!isExpectedPlayer) {
      socket.emit("battleError", { message: "Bu jangga kirishga ruxsat yo'q" });
      return;
    }
    socket.join(roomId);

    if (String(pending.player1.userId) === String(userId)) {
      pending.player1.ready = true;
      pending.player1.socketId = socket.id;
    } else if (String(pending.player2.userId) === String(userId)) {
      pending.player2.ready = true;
      pending.player2.socketId = socket.id;
    }

    if (pending.player1.ready && pending.player2.ready) {
      const lengthKey = pending.lengthKey
        || pending.player1.lengthKey
        || "standard";
      const player1 = {
        socketId: pending.player1.socketId,
        userId: pending.player1.userId,
        name: pending.player1.name,
        level: pending.player1.level,
        lengthKey,
      };
      const player2 = {
        socketId: pending.player2.socketId,
        userId: pending.player2.userId,
        name: pending.player2.name,
        level: pending.player2.level,
        lengthKey,
      };
      delete pendingBattles[roomId];
      startBattle(roomId, player1, player2);
    }
  };
}

function registerFriendBattleJoinSocket({ socket, pendingBattles, startBattle }) {
  socket.on("joinFriendBattle", createJoinFriendBattleHandler({
    socket,
    pendingBattles,
    startBattle,
  }));
}

module.exports = registerFriendBattleJoinSocket;
