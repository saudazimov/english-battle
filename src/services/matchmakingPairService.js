function createMatchmakingPairService({
  io,
  pool,
  getOpponentCardInfo,
  startBattle,
  setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
}) {
  return async function pairPlayers(playerA, playerB) {
    const roomId = `battle_${playerA.socketId}_${playerB.socketId}`;
    io.sockets.sockets.get(playerA.socketId)?.join(roomId);
    io.sockets.sockets.get(playerB.socketId)?.join(roomId);

    const cardA = await getOpponentCardInfo(playerA.userId);
    const cardB = await getOpponentCardInfo(playerB.userId);
    let pictureA = null;
    let pictureB = null;
    try {
      const pictureResult = await pool.query(
        "SELECT id, profile_picture FROM users WHERE id = ANY($1)",
        [[playerA.userId, playerB.userId]]
      );
      pictureResult.rows.forEach((row) => {
        if (String(row.id) === String(playerA.userId)) pictureA = row.profile_picture;
        if (String(row.id) === String(playerB.userId)) pictureB = row.profile_picture;
      });
    } catch (profileLookupError) {
      // Profile pictures are optional; preserve the existing null fallback.
      void profileLookupError;
    }

    const foundForA = {
      roomId,
      opponent: {
        name: playerB.name,
        profile_picture: pictureB,
        rating: cardB.rating,
        win_rate: cardB.win_rate,
        level: playerB.level,
      },
      message: "Raqib topildi!",
    };
    const foundForB = {
      roomId,
      opponent: {
        name: playerA.name,
        profile_picture: pictureA,
        rating: cardA.rating,
        win_rate: cardA.win_rate,
        level: playerA.level,
      },
      message: "Raqib topildi!",
    };
    io.to(playerA.socketId).emit("matchFound", foundForA);
    io.to(playerA.socketId).emit("matchmaking:found", foundForA);
    io.to(playerB.socketId).emit("matchFound", foundForB);
    io.to(playerB.socketId).emit("matchmaking:found", foundForB);

    setTimeoutFn(() => startBattle(roomId, playerA, playerB), 6000);
  };
}

module.exports = { createMatchmakingPairService };
