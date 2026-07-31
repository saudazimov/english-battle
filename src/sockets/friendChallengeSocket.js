const MAX_IDENTIFIER_LENGTH = 256;
const CHALLENGE_TTL_MS = 60000;
const defaultPendingChallenges = new Map();
const validLevels = new Set(["A1", "A2", "B1", "B2", "C1"]);

function hasOwn(record, key) {
  return record !== null
    && typeof record === "object"
    && Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeIdentifier(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const identifier = String(value);
  if (!identifier || identifier.length > MAX_IDENTIFIER_LENGTH) return null;
  return identifier;
}

function normalizeLevel(level) {
  return validLevels.has(level) ? level : "A1";
}

function normalizeLengthKey(lengthKey) {
  return typeof lengthKey === "string"
    && lengthKey.length > 0
    && lengthKey.length <= 64
    ? lengthKey
    : "standard";
}

function emitInvalidChallenge(socket) {
  socket.emit("challengeResult", {
    success: false,
    message: "Chaqiruv haqiqiy emas",
  });
}

async function getChallengeSender({ pool, fromUserId, logger }) {
  let fromPic = null;
  let dbName = null;
  try {
    const result = await pool.query(
      "SELECT profile_picture, first_name, last_name FROM users WHERE id = $1",
      [fromUserId]
    );
    if (result.rows[0]) {
      fromPic = result.rows[0].profile_picture;
      dbName = (
        (result.rows[0].first_name || "") + " "
        + (result.rows[0].last_name || "")
      ).trim();
    }
  } catch (error) {
    logger.error("Chaqiruv yuboruvchisini olish xatosi:", error.message);
  }
  return { fromPic, dbName };
}

function createChallengeFriendHandler({
  socket,
  io,
  pool,
  onlineUsers,
  stripUnsafe,
  pendingChallenges,
  setTimer,
  now,
  logger,
}) {
  return async function challengeFriend(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      emitInvalidChallenge(socket);
      return;
    }

    const { fromName, toUserId, level, lengthKey } = payload;
    const fromUserId = socket.userId;
    const targetUserId = normalizeIdentifier(toUserId);
    if (!targetUserId || targetUserId === String(fromUserId)) {
      emitInvalidChallenge(socket);
      return;
    }

    logger.log(
      "Chaqiruv:",
      fromUserId,
      "->",
      toUserId,
      "| Onlayn:",
      Object.keys(onlineUsers)
    );
    const targetSocketId = hasOwn(onlineUsers, targetUserId)
      ? onlineUsers[targetUserId]
      : null;
    const targetSocket = typeof targetSocketId === "string"
      && targetSocketId.length > 0
      && targetSocketId.length <= MAX_IDENTIFIER_LENGTH
      ? io.sockets.sockets.get(targetSocketId)
      : null;

    if (!targetSocket || String(targetSocket.userId) !== targetUserId) {
      socket.emit("challengeResult", {
        success: false,
        message: "Do'stingiz hozir onlayn emas",
      });
      return;
    }

    const { fromPic, dbName } = await getChallengeSender({
      pool,
      fromUserId,
      logger,
    });
    const nameCandidate = dbName
      || (typeof fromName === "string" ? fromName : "");
    const safeFromName = stripUnsafe(nameCandidate, 60) || "O'yinchi";
    const selectedLevel = normalizeLevel(level);
    const selectedLengthKey = normalizeLengthKey(lengthKey);
    const challengeKey = targetSocketId + ":" + socket.id;
    const request = {
      fromSocketId: socket.id,
      fromUserId,
      toSocketId: targetSocketId,
      toUserId: targetUserId,
      fromName: safeFromName,
      level: selectedLevel,
      lengthKey: selectedLengthKey,
      expiresAt: now() + CHALLENGE_TTL_MS,
    };
    pendingChallenges.set(challengeKey, request);
    const cleanup = setTimer(() => {
      if (pendingChallenges.get(challengeKey) === request) {
        pendingChallenges.delete(challengeKey);
      }
    }, CHALLENGE_TTL_MS + 1000);
    if (cleanup && typeof cleanup.unref === "function") cleanup.unref();
    io.to(targetSocketId).emit("challengeReceived", {
      fromUserId,
      fromName: safeFromName,
      fromSocketId: socket.id,
      fromPic,
      level: selectedLevel,
      lengthKey: selectedLengthKey,
    });
    socket.emit("challengeResult", {
      success: true,
      message: "Chaqiruv yuborildi, javob kutilmoqda...",
    });
  };
}

function createCancelChallengeHandler({
  socket,
  io,
  onlineUsers,
  pendingChallenges,
}) {
  return function cancelChallenge(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

    const targetUserId = normalizeIdentifier(payload.toUserId);
    if (!targetUserId || !hasOwn(onlineUsers, targetUserId)) return;
    const targetSocketId = onlineUsers[targetUserId];
    if (typeof targetSocketId !== "string" || !targetSocketId) return;

    const challengeKey = targetSocketId + ":" + socket.id;
    const request = pendingChallenges.get(challengeKey);
    if (
      !request
      || String(request.fromUserId) !== String(socket.userId)
      || request.toUserId !== targetUserId
    ) return;

    pendingChallenges.delete(challengeKey);
    io.to(targetSocketId).emit("challengeCancelled", {
      fromUserId: socket.userId,
    });
  };
}

async function getChallengePictures({ pool, fromUserId, myUserId, logger }) {
  let fromPic = null;
  let myPic = null;
  try {
    const result = await pool.query(
      "SELECT id, profile_picture FROM users WHERE id = ANY($1)",
      [[fromUserId, myUserId]]
    );
    result.rows.forEach((row) => {
      if (String(row.id) === String(fromUserId)) fromPic = row.profile_picture;
      if (String(row.id) === String(myUserId)) myPic = row.profile_picture;
    });
  } catch (error) {
    logger.error("Chaqiruv profil rasmlarini olish xatosi:", error.message);
  }
  return { fromPic, myPic };
}

function consumePendingChallenge({
  pendingChallenges,
  socket,
  fromSocketId,
  now,
}) {
  const challengeKey = socket.id + ":" + fromSocketId;
  const request = pendingChallenges.get(challengeKey);
  pendingChallenges.delete(challengeKey);
  if (
    !request
    || request.expiresAt < now()
    || request.fromSocketId !== fromSocketId
    || request.toSocketId !== socket.id
    || request.toUserId !== String(socket.userId)
  ) return null;
  return request;
}

function emitChallengeMatchFound({
  socket,
  challengerSocket,
  roomId,
  fromName,
  myName,
  fromPic,
  myPic,
  fromCard,
  myCard,
  level,
  lengthKey,
}) {
  if (challengerSocket) {
    challengerSocket.emit("matchFound", {
      roomId,
      opponent: {
        name: myName,
        profile_picture: myPic,
        rating: myCard.rating,
        win_rate: myCard.win_rate,
        level: level || "A1",
      },
      lengthKey,
      message: "Do'stingiz qabul qildi!",
    });
  }
  socket.emit("matchFound", {
    roomId,
    opponent: {
      name: fromName,
      profile_picture: fromPic,
      rating: fromCard.rating,
      win_rate: fromCard.win_rate,
      level: level || "A1",
    },
    lengthKey,
    message: "Jang boshlanmoqda!",
  });
}

function createPendingChallengeBattle({
  fromUserId,
  fromName,
  myUserId,
  myName,
  level,
  lengthKey,
}) {
  return {
    lengthKey,
    player1: {
      userId: fromUserId,
      name: fromName,
      level: level || "A1",
      lengthKey,
      ready: false,
      socketId: null,
    },
    player2: {
      userId: myUserId,
      name: myName,
      level: level || "A1",
      lengthKey,
      ready: false,
      socketId: null,
    },
  };
}

function createChallengeResponseHandler({
  socket,
  io,
  pool,
  stripUnsafe,
  getOpponentCardInfo,
  pendingBattles,
  pendingChallenges,
  now,
  logger,
}) {
  return async function challengeResponse(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      emitInvalidChallenge(socket);
      return;
    }

    const fromSocketId = normalizeIdentifier(payload.fromSocketId);
    if (!fromSocketId) {
      emitInvalidChallenge(socket);
      return;
    }

    const request = consumePendingChallenge({
      pendingChallenges,
      socket,
      fromSocketId,
      now,
    });
    if (!request) {
      emitInvalidChallenge(socket);
      return;
    }

    const { accepted } = payload;
    const myUserId = socket.userId;
    const fromUserId = request.fromUserId;
    const fromName = request.fromName;
    const myName = stripUnsafe(
      typeof payload.myName === "string" ? payload.myName : "",
      60
    ) || "O'yinchi";
    const level = request.level;
    const lengthKey = request.lengthKey;
    const challengerSocket = io.sockets.sockets.get(fromSocketId);
    if (
      !challengerSocket
      || String(challengerSocket.userId) !== String(fromUserId)
    ) {
      socket.emit("challengeResult", {
        success: false,
        message: "Chaqiruv haqiqiy emas",
      });
      return;
    }

    if (!accepted) {
      if (challengerSocket) {
        challengerSocket.emit("challengeDeclined", { byName: myName });
      }
      return;
    }

    const selectedLengthKey = lengthKey || "standard";
    const roomId = "friend_battle_" + fromSocketId + "_" + socket.id;
    if (challengerSocket) challengerSocket.join(roomId);
    socket.join(roomId);

    const { fromPic, myPic } = await getChallengePictures({
      pool,
      fromUserId,
      myUserId,
      logger,
    });
    const fromCard = await getOpponentCardInfo(fromUserId);
    const myCard = await getOpponentCardInfo(myUserId);
    emitChallengeMatchFound({
      socket,
      challengerSocket,
      roomId,
      fromName,
      myName,
      fromPic,
      myPic,
      fromCard,
      myCard,
      level,
      lengthKey: selectedLengthKey,
    });
    pendingBattles[roomId] = createPendingChallengeBattle({
      fromUserId,
      fromName,
      myUserId,
      myName,
      level,
      lengthKey: selectedLengthKey,
    });
  };
}

function registerFriendChallengeSocket({
  socket,
  io,
  pool,
  onlineUsers,
  stripUnsafe,
  getOpponentCardInfo,
  pendingBattles,
  pendingChallenges = defaultPendingChallenges,
  logger = console,
  setTimer = setTimeout,
  now = Date.now,
}) {
  socket.on("challengeFriend", createChallengeFriendHandler({
    socket,
    io,
    pool,
    onlineUsers,
    stripUnsafe,
    pendingChallenges,
    setTimer,
    now,
    logger,
  }));
  socket.on("cancelChallenge", createCancelChallengeHandler({
    socket,
    io,
    onlineUsers,
    pendingChallenges,
  }));
  socket.on("challengeResponse", createChallengeResponseHandler({
    socket,
    io,
    pool,
    stripUnsafe,
    getOpponentCardInfo,
    pendingBattles,
    pendingChallenges,
    now,
    logger,
  }));
}

module.exports = registerFriendChallengeSocket;
