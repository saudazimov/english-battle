const MAX_IDENTIFIER_LENGTH = 256;

function hasOwn(record, key) {
  return record !== null
    && typeof record === "object"
    && Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeLookupKey(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const key = String(value);
  if (!key || key.length > MAX_IDENTIFIER_LENGTH) return null;
  return key;
}

function emitInvalidRematchRequest(socket) {
  socket.emit("rematchUnavailable", { message: "Rematch so'rovi noto'g'ri" });
}

function emitInvalidRematchResponse(socket) {
  socket.emit("rematchUnavailable", {
    message: "Rematch so'rovi eskirgan yoki haqiqiy emas",
  });
}

function createRequestRematchHandler({
  socket,
  io,
  pool,
  onlineUsers,
  stripUnsafe,
  battleLengths,
  pendingRematches,
  setTimer,
  now,
  logger,
}) {
  return async function requestRematch(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      emitInvalidRematchRequest(socket);
      return;
    }

    const { opponentId, level, lengthKey } = payload;
    const myUserId = socket.userId;
    const opponentKey = normalizeLookupKey(opponentId);
    if (!opponentKey || opponentKey === String(myUserId)) {
      emitInvalidRematchRequest(socket);
      return;
    }

    const targetSocketId = hasOwn(onlineUsers, opponentKey)
      ? onlineUsers[opponentKey]
      : null;
    if (
      typeof targetSocketId !== "string"
      || !targetSocketId
      || targetSocketId.length > MAX_IDENTIFIER_LENGTH
    ) {
      socket.emit("rematchUnavailable", { message: "Raqib hozir mavjud emas" });
      return;
    }

    try {
      const recent = await pool.query(
        `SELECT u.first_name, u.last_name
         FROM users u
         WHERE u.id=$1 AND EXISTS (
           SELECT 1 FROM battle_history bh
           WHERE bh.user_id=$1 AND bh.opponent_id=$2
             AND bh.created_at > NOW() - INTERVAL '2 hours'
         )`,
        [myUserId, opponentId]
      );
      if (!recent.rows[0]) {
        socket.emit("rematchUnavailable", {
          message: "Faqat yaqinda jang qilgan raqibga rematch yuboriladi",
        });
        return;
      }

      const fromName = stripUnsafe(
        ((recent.rows[0].first_name || "") + " "
          + (recent.rows[0].last_name || "")).trim(),
        60
      ) || "O'yinchi";
      const request = {
        fromSocketId: socket.id,
        fromUserId: String(myUserId),
        toUserId: String(opponentId),
        fromName,
        level: ["A1", "A2", "B1", "B2", "C1"].includes(level) ? level : "A1",
        lengthKey: hasOwn(battleLengths, lengthKey) && battleLengths[lengthKey]
          ? lengthKey
          : "standard",
        expiresAt: now() + 60000,
      };
      const rematchKey = targetSocketId + ":" + socket.id;
      pendingRematches.set(rematchKey, request);
      const cleanup = setTimer(() => {
        if (pendingRematches.get(rematchKey) === request) {
          pendingRematches.delete(rematchKey);
        }
      }, 61000);
      cleanup.unref();
      io.to(targetSocketId).emit("rematchRequested", request);
    } catch (error) {
      logger.error("Rematch tekshirish xatosi:", error.message);
      socket.emit("rematchUnavailable", {
        message: "Rematchni tekshirib bo'lmadi",
      });
    }
  };
}

async function getRematchUserName({ pool, userId, stripUnsafe, logger }) {
  let name = "O'yinchi";
  try {
    const result = await pool.query(
      "SELECT first_name, last_name FROM users WHERE id=$1",
      [userId]
    );
    if (result.rows[0]) {
      name = stripUnsafe(
        ((result.rows[0].first_name || "") + " "
          + (result.rows[0].last_name || "")).trim(),
        60
      ) || name;
    }
  } catch (error) {
    logger.error("Rematch user nomini olish xatosi:", error.message);
  }
  return name;
}

async function getRematchPictures({ pool, fromUserId, myUserId, logger }) {
  let fromPicture = null;
  let myPicture = null;
  try {
    const result = await pool.query(
      "SELECT id, profile_picture FROM users WHERE id = ANY($1)",
      [[fromUserId, myUserId]]
    );
    result.rows.forEach((row) => {
      if (String(row.id) === String(fromUserId)) fromPicture = row.profile_picture;
      if (String(row.id) === String(myUserId)) myPicture = row.profile_picture;
    });
  } catch (error) {
    logger.error("Rematch profil rasmlarini olish xatosi:", error.message);
  }
  return { fromPicture, myPicture };
}

function createPendingRematchBattle({
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

function emitRematchMatchFound({
  socket,
  requesterSocket,
  roomId,
  fromName,
  myName,
  fromPicture,
  myPicture,
  fromCard,
  myCard,
  level,
  lengthKey,
}) {
  if (requesterSocket) {
    requesterSocket.emit("matchFound", {
      roomId,
      opponent: {
        name: myName,
        profile_picture: myPicture,
        rating: myCard.rating,
        level: level || "A1",
      },
      lengthKey,
      redirect: true,
      message: "Rematch qabul qilindi!",
    });
  }
  socket.emit("matchFound", {
    roomId,
    opponent: {
      name: fromName,
      profile_picture: fromPicture,
      rating: fromCard.rating,
      level: level || "A1",
    },
    lengthKey,
    redirect: true,
    message: "Siz rematchni qabul qildingiz!",
  });
}

function createRematchResponseHandler({
  socket,
  io,
  pool,
  stripUnsafe,
  pendingRematches,
  pendingBattles,
  getOpponentCardInfo,
  now,
  logger,
}) {
  return async function rematchResponse(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      emitInvalidRematchResponse(socket);
      return;
    }

    const { accepted, fromSocketId } = payload;
    if (
      typeof fromSocketId !== "string"
      || !fromSocketId
      || fromSocketId.length > MAX_IDENTIFIER_LENGTH
    ) {
      emitInvalidRematchResponse(socket);
      return;
    }

    const myUserId = socket.userId;
    const requestKey = socket.id + ":" + fromSocketId;
    const request = pendingRematches.get(requestKey);
    pendingRematches.delete(requestKey);
    if (
      !request
      || request.expiresAt < now()
      || request.toUserId !== String(myUserId)
    ) {
      socket.emit("rematchUnavailable", {
        message: "Rematch so'rovi eskirgan yoki haqiqiy emas",
      });
      return;
    }

    const fromUserId = request.fromUserId;
    const fromName = request.fromName;
    const requesterSocket = io.sockets.sockets.get(fromSocketId);
    if (!requesterSocket || String(requesterSocket.userId) !== String(fromUserId)) {
      socket.emit("rematchUnavailable", { message: "Rematch so'rovi haqiqiy emas" });
      return;
    }

    const myName = await getRematchUserName({
      pool,
      userId: myUserId,
      stripUnsafe,
      logger,
    });

    if (!accepted) {
      if (requesterSocket) {
        requesterSocket.emit("rematchDeclined", { byName: myName });
      }
      return;
    }

    const level = request.level;
    const lengthKey = request.lengthKey;
    const roomId = "friend_battle_rematch_" + fromSocketId + "_"
      + socket.id + "_" + now();
    const { fromPicture, myPicture } = await getRematchPictures({
      pool,
      fromUserId,
      myUserId,
      logger,
    });

    const fromCard = await getOpponentCardInfo(fromUserId);
    const myCard = await getOpponentCardInfo(myUserId);
    pendingBattles[roomId] = createPendingRematchBattle({
      fromUserId,
      fromName,
      myUserId,
      myName,
      level,
      lengthKey,
    });
    emitRematchMatchFound({
      socket,
      requesterSocket,
      roomId,
      fromName,
      myName,
      fromPicture,
      myPicture,
      fromCard,
      myCard,
      level,
      lengthKey,
    });
  };
}

function registerRematchSocket({
  socket,
  io,
  pool,
  onlineUsers,
  stripUnsafe,
  battleLengths,
  pendingRematches,
  pendingBattles,
  getOpponentCardInfo,
  logger = console,
  setTimer = setTimeout,
  now = Date.now,
}) {
  socket.on("requestRematch", createRequestRematchHandler({
    socket,
    io,
    pool,
    onlineUsers,
    stripUnsafe,
    battleLengths,
    pendingRematches,
    setTimer,
    now,
    logger,
  }));
  socket.on("rematchResponse", createRematchResponseHandler({
    socket,
    io,
    pool,
    stripUnsafe,
    pendingRematches,
    pendingBattles,
    getOpponentCardInfo,
    now,
    logger,
  }));
}

module.exports = registerRematchSocket;
