function createFindTeamMatchHandler({
  socket,
  io,
  teamMatchPool,
  addTeamEntry,
  emitTeamQueueStatus,
  stripUnsafe,
  now,
  logger,
}) {
  return async function findTeamMatch(playerData) {
    playerData = playerData || {};
    playerData.userId = socket.userId;
    try {
      const teamMode = playerData.teamMode === "squad" ? "squad" : "duo";
      ["duo", "squad"].forEach(function (mode) {
        const entries = teamMatchPool[mode];
        const filtered = entries.filter(function (existing) {
          if (existing.type !== "solo") return true;
          return !existing.players.some(function (player) {
            return String(player.userId) === String(socket.userId);
          });
        });
        if (filtered.length !== entries.length) {
          teamMatchPool[mode] = filtered;
          emitTeamQueueStatus(mode);
        }
      });
      const entry = {
        id: "solo_" + socket.id + "_" + now(),
        type: "solo",
        size: 1,
        players: [{
          socketId: socket.id,
          userId: playerData.userId,
          name: stripUnsafe(playerData.name, 60) || "O'yinchi",
          level: playerData.level || "A1",
          lengthKey: playerData.lengthKey || "standard",
          rating: playerData.rating || 1000,
          profile_picture: playerData.profile_picture || null,
        }],
      };
      addTeamEntry(teamMode, entry);
    } catch (error) {
      logger.error("Jamoa matchmaking xatosi:", error.message);
      io.to(socket.id).emit("battleError", {
        message: "Jamoa qidirishda xato",
      });
    }
  };
}

function createCancelTeamMatchHandler({
  socket,
  teamMatchPool,
  emitTeamQueueStatus,
}) {
  return function cancelTeamMatch() {
    ["duo", "squad"].forEach(function (mode) {
      const pool = teamMatchPool[mode];
      const before = pool.length;
      teamMatchPool[mode] = pool.filter(function (entry) {
        return !entry.players.some(function (player) {
          return player.socketId === socket.id;
        });
      });
      if (teamMatchPool[mode].length !== before) {
        emitTeamQueueStatus(mode);
      }
    });
  };
}

function registerTeamMatchmakingSocket({
  socket,
  io,
  teamMatchPool,
  addTeamEntry,
  emitTeamQueueStatus,
  stripUnsafe,
  now = Date.now,
  logger = console,
}) {
  socket.on("findTeamMatch", createFindTeamMatchHandler({
    socket,
    io,
    teamMatchPool,
    addTeamEntry,
    emitTeamQueueStatus,
    stripUnsafe,
    now,
    logger,
  }));
  socket.on("cancelTeamMatch", createCancelTeamMatchHandler({
    socket,
    teamMatchPool,
    emitTeamQueueStatus,
  }));
}

module.exports = registerTeamMatchmakingSocket;
