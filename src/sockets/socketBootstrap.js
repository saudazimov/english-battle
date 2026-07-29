const { Server } = require("socket.io");
const { verifySocketToken } = require("../../auth");
const registerClassWatchSocket = require("./classWatchSocket");
const { createConnectionLifecycleSocket } = require("./connectionLifecycleSocket");
const registerBattleSocialSocket = require("./battleSocialSocket");
const { createFriendBattleSocket } = require("./friendBattleSocket");
const { createSoloBattleSocket } = require("./soloBattleSocket");
const registerTeamBattleSocket = require("./teamBattleSocket");
const registerPartySocket = require("./partySocket");

const defaultRegistrars = {
  registerClassWatchSocket,
  createConnectionLifecycleSocket,
  registerBattleSocialSocket,
  createFriendBattleSocket,
  createSoloBattleSocket,
  registerTeamBattleSocket,
  registerPartySocket,
};

function createSocketAuthMiddleware({ pool, verifyToken, logger }) {
  return async function authenticateSocket(socket, next) {
    const token =
      (socket.handshake.auth && socket.handshake.auth.token) ||
      (socket.handshake.query && socket.handshake.query.token) ||
      null;
    const decoded = verifyToken(token);

    if (!decoded || decoded.id == null) {
      return next(new Error("AUTH_REQUIRED"));
    }

    try {
      const userResult = await pool.query(
        "SELECT id, is_banned, auth_version FROM users WHERE id = $1",
        [decoded.id]
      );
      const user = userResult.rows[0];
      if (!user) return next(new Error("ACCOUNT_NOT_FOUND"));
      if (user.is_banned) return next(new Error("ACCOUNT_BANNED"));
      if ((Number(decoded.ver) || 0) !== (Number(user.auth_version) || 0)) {
        return next(new Error("SESSION_REVOKED"));
      }

      socket.authUserId = String(user.id);
      socket.userId = String(user.id);
      return next();
    } catch (err) {
      logger.error("Socket autentifikatsiya xatosi:", err.message);
      return next(new Error("AUTH_SERVICE_ERROR"));
    }
  };
}

function createSocketServer({
  server,
  corsOptions,
  pool,
  logger = console,
  ServerClass = Server,
  verifyToken = verifySocketToken,
}) {
  const io = new ServerClass(server, { cors: corsOptions });
  io.use(createSocketAuthMiddleware({ pool, verifyToken, logger }));
  return io;
}

function registerSocketConnection({
  io,
  pool,
  battles,
  userToRoom,
  onlineUsers,
  removeFromQueue,
  notifyFriendsStatus,
  removeFromParty,
  emitTeamProgress,
  checkTeamFinish,
  finishBattle,
  stripUnsafe,
  filterProfanity,
  battleLengths,
  pendingRematches,
  pendingBattles,
  getOpponentCardInfo,
  parties,
  userParty,
  pendingPartyMatches,
  broadcastParty,
  startPartyBattle,
  makePartyId,
  startBattle,
  waitingQueue,
  tryQueueMatch,
  getRandomBotName,
  startBotBattle,
  saveBattleSession,
  timePerQuestionMs,
  answerGraceMs,
  recentlyFinished,
  finishBattleSession,
  rebindPlayerSocket,
  teamMatchPool,
  addTeamEntry,
  emitTeamQueueStatus,
  logger = console,
  registrars = defaultRegistrars,
}) {
  io.on("connection", (socket) => {
    logger.log("Socket connected:", socket.id);

    registrars.registerClassWatchSocket(socket);

    const connectionLifecycleSocket = registrars.createConnectionLifecycleSocket({
      socket,
      pool,
      battles,
      userToRoom,
      onlineUsers,
      removeFromQueue,
      notifyFriendsStatus,
      removeFromParty,
      emitTeamProgress,
      checkTeamFinish,
      finishBattle,
      logger,
    });
    connectionLifecycleSocket.registerPresenceSocket();

    registrars.registerBattleSocialSocket({
      socket,
      io,
      pool,
      battles,
      onlineUsers,
      stripUnsafe,
      filterProfanity,
      battleLengths,
      pendingRematches,
      pendingBattles,
      getOpponentCardInfo,
      logger,
    });

    registrars.registerPartySocket({
      socket,
      io,
      parties,
      userParty,
      onlineUsers,
      pendingPartyMatches,
      removeFromParty,
      broadcastParty,
      startPartyBattle,
      stripUnsafe,
      makePartyId,
      logger,
    });

    const friendBattleSocket = registrars.createFriendBattleSocket({
      socket,
      io,
      pool,
      onlineUsers,
      stripUnsafe,
      getOpponentCardInfo,
      pendingBattles,
      startBattle,
      logger,
    });
    friendBattleSocket.registerChallengeSocket();

    logger.log("Yangi o'yinchi ulandi:", socket.id);
    friendBattleSocket.registerBattleJoinSocket();

    const soloBattleSocket = registrars.createSoloBattleSocket({
      socket,
      pool,
      battles,
      waitingQueue,
      removeFromQueue,
      tryQueueMatch,
      stripUnsafe,
      getRandomBotName,
      startBotBattle,
      saveBattleSession,
      finishBattle,
      timePerQuestionMs,
      answerGraceMs,
      userToRoom,
      recentlyFinished,
      finishBattleSession,
      rebindPlayerSocket,
      emitTeamProgress,
      checkTeamFinish,
      logger,
    });
    soloBattleSocket.registerMatchmakingSocket();

    registrars.registerTeamBattleSocket({
      socket,
      io,
      pool,
      battles,
      teamMatchPool,
      addTeamEntry,
      emitTeamQueueStatus,
      stripUnsafe,
      emitTeamProgress,
      checkTeamFinish,
      timePerQuestionMs,
      answerGraceMs,
      logger,
    });

    soloBattleSocket.registerLifecycleSocket();
    connectionLifecycleSocket.registerDisconnectSocketHandler();
  });
}

module.exports = {
  createSocketAuthMiddleware,
  createSocketServer,
  registerSocketConnection,
};
