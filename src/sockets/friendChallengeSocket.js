async function getChallengeSender({ pool, fromUserId }) {
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
  } catch (error) {}
  return { fromPic, dbName };
}

function createChallengeFriendHandler({
  socket,
  io,
  pool,
  onlineUsers,
  stripUnsafe,
  logger,
}) {
  return async function challengeFriend({
    fromUserId,
    fromName,
    toUserId,
    level,
    lengthKey,
  }) {
    fromUserId = socket.userId;
    logger.log(
      "Chaqiruv:",
      fromUserId,
      "->",
      toUserId,
      "| Onlayn:",
      Object.keys(onlineUsers)
    );
    const targetSocketId = onlineUsers[String(toUserId)];

    if (!targetSocketId) {
      socket.emit("challengeResult", {
        success: false,
        message: "Do'stingiz hozir onlayn emas",
      });
      return;
    }

    const { fromPic, dbName } = await getChallengeSender({
      pool,
      fromUserId,
    });
    io.to(targetSocketId).emit("challengeReceived", {
      fromUserId,
      fromName: dbName || stripUnsafe(fromName, 60) || "O'yinchi",
      fromSocketId: socket.id,
      fromPic,
      level,
      lengthKey: lengthKey || "standard",
    });
    socket.emit("challengeResult", {
      success: true,
      message: "Chaqiruv yuborildi, javob kutilmoqda...",
    });
  };
}

function createCancelChallengeHandler({ socket, io, onlineUsers }) {
  return function cancelChallenge({ fromUserId, toUserId }) {
    fromUserId = socket.userId;
    const targetSocketId = onlineUsers[String(toUserId)];
    if (targetSocketId) {
      io.to(targetSocketId).emit("challengeCancelled", { fromUserId });
    }
  };
}

async function getChallengePictures({ pool, fromUserId, myUserId }) {
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
  } catch (error) {}
  return { fromPic, myPic };
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
}) {
  return async function challengeResponse({
    accepted,
    fromSocketId,
    fromUserId,
    fromName,
    myUserId,
    myName,
    level,
    lengthKey,
  }) {
    myUserId = socket.userId;
    fromName = stripUnsafe(fromName, 60) || "O'yinchi";
    myName = stripUnsafe(myName, 60) || "O'yinchi";
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
    fromUserId = challengerSocket.userId;

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
  logger = console,
}) {
  socket.on("challengeFriend", createChallengeFriendHandler({
    socket,
    io,
    pool,
    onlineUsers,
    stripUnsafe,
    logger,
  }));
  socket.on("cancelChallenge", createCancelChallengeHandler({
    socket,
    io,
    onlineUsers,
  }));
  socket.on("challengeResponse", createChallengeResponseHandler({
    socket,
    io,
    pool,
    stripUnsafe,
    getOpponentCardInfo,
    pendingBattles,
  }));
}

module.exports = registerFriendChallengeSocket;
