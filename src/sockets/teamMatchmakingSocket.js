function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record, key) {
  return isRecord(record) && Object.prototype.hasOwnProperty.call(record, key);
}

function validUserId(value) {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const candidate = String(value);
  if (!/^[1-9]\d*$/.test(candidate)) return false;
  return Number.isSafeInteger(Number(candidate));
}

function validQueueEntry(entry) {
  return isRecord(entry)
    && Array.isArray(entry.players)
    && entry.players.every(isRecord);
}

function boundedString(value, maxLength, fallback) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    ? value
    : fallback;
}

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
  return async function findTeamMatch(payload) {
    try {
      const playerData = payload == null ? {} : payload;
      if (!isRecord(playerData) || !validUserId(socket.userId)) {
        throw new TypeError("Invalid team matchmaking payload");
      }
      playerData.userId = socket.userId;
      const teamMode = playerData.teamMode === "squad" ? "squad" : "duo";
      const modes = ["duo", "squad"];
      const poolsValid = modes.every(function (mode) {
        return hasOwn(teamMatchPool, mode) && Array.isArray(teamMatchPool[mode]);
      });
      if (!poolsValid) throw new TypeError("Invalid team matchmaking pool");

      modes.forEach(function (mode) {
        const entries = teamMatchPool[mode];
        const filtered = entries.filter(function (existing) {
          if (!validQueueEntry(existing)) return false;
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
          name: stripUnsafe(
            typeof playerData.name === "string" ? playerData.name : "",
            60
          ) || "O'yinchi",
          level: boundedString(playerData.level, 16, "A1"),
          lengthKey: boundedString(playerData.lengthKey, 32, "standard"),
          rating: Number.isFinite(playerData.rating) && playerData.rating > 0
            ? playerData.rating
            : 1000,
          profile_picture: boundedString(
            playerData.profile_picture,
            2048,
            null
          ),
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
    if (!isRecord(teamMatchPool)) return;
    ["duo", "squad"].forEach(function (mode) {
      if (!hasOwn(teamMatchPool, mode) || !Array.isArray(teamMatchPool[mode])) {
        teamMatchPool[mode] = [];
        emitTeamQueueStatus(mode);
        return;
      }
      const pool = teamMatchPool[mode];
      const before = pool.length;
      teamMatchPool[mode] = pool.filter(function (entry) {
        if (!validQueueEntry(entry)) return false;
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
