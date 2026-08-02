const createMatchmakingPlayerProfileService = require(
  "../services/matchmakingPlayerProfileService"
);
const { BATTLE_LENGTHS } = require("../utils/battleLength");

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

function validLengthKey(value) {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(BATTLE_LENGTHS, value);
}

function createFindTeamMatchHandler({
  socket,
  io,
  teamMatchPool,
  addTeamEntry,
  emitTeamQueueStatus,
  loadPlayerProfile,
  now,
  logger,
}) {
  return async function findTeamMatch(payload) {
    try {
      const playerData = payload == null ? {} : payload;
      if (!isRecord(playerData) || !validUserId(socket.userId)) {
        throw new TypeError("Invalid team matchmaking payload");
      }
      const teamMode = playerData.teamMode === "squad" ? "squad" : "duo";
      const modes = ["duo", "squad"];
      const poolsValid = modes.every(function (mode) {
        return hasOwn(teamMatchPool, mode) && Array.isArray(teamMatchPool[mode]);
      });
      if (!poolsValid) throw new TypeError("Invalid team matchmaking pool");
      const playerProfile = await loadPlayerProfile(socket.userId);

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
          userId: playerProfile.userId,
          name: playerProfile.name,
          level: playerProfile.level,
          lengthKey: validLengthKey(playerData.lengthKey)
            ? playerData.lengthKey
            : "standard",
          rating: playerProfile.rating,
          profile_picture: playerProfile.profile_picture,
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
  pool,
  teamMatchPool,
  addTeamEntry,
  emitTeamQueueStatus,
  stripUnsafe,
  now = Date.now,
  logger = console,
}) {
  const { loadPlayerProfile } = createMatchmakingPlayerProfileService({
    pool,
    stripUnsafe,
  });
  socket.on("findTeamMatch", createFindTeamMatchHandler({
    socket,
    io,
    teamMatchPool,
    addTeamEntry,
    emitTeamQueueStatus,
    loadPlayerProfile,
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
