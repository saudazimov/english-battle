const MAX_RECONNECT_AGE_MS = 10 * 60 * 1000;

function safeQuestions(questions) {
  return questions.map((question) => ({
    id: question.id,
    question_text: question.question_text,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
  }));
}

async function loadAnswerStats({ pool, roomId, userId, onError }) {
  let correctCount = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  try {
    const result = await pool.query(
      `SELECT is_correct FROM battle_answers
       WHERE room_id = $1 AND user_id = $2
       ORDER BY q_order ASC`,
      [roomId, userId]
    );
    let run = 0;
    for (const row of result.rows) {
      if (row.is_correct) {
        correctCount++;
        run++;
        if (run > bestStreak) bestStreak = run;
      } else {
        run = 0;
      }
    }
    currentStreak = run;
  } catch (error) {
    if (onError) onError(error);
  }
  return { correctCount, currentStreak, bestStreak };
}

function teamPlayerInfo(battle, socketIds) {
  return socketIds.map(function (socketId) {
    const player = battle.players[socketId];
    return {
      name: player.name,
      isBot: player.isBot,
      userId: player.userId,
      level: player.level,
      rating: player.rating,
      profile_picture: player.profile_picture,
      answeredCount: player.answeredCount,
      score: player.score,
      finished: player.finished,
    };
  });
}

function teamScore(battle, socketIds) {
  return socketIds.reduce(function (sum, socketId) {
    return sum + battle.players[socketId].score;
  }, 0);
}

function resumeTeamBattle({ socket, battle, player, roomId, userId, now, logger }) {
  player.disconnected = false;
  const questions = safeQuestions(battle.questions);
  const myTeam = player.team;
  const enemyTeam = myTeam === "A" ? "B" : "A";
  const myTeamPlayers = teamPlayerInfo(battle, battle.teams[myTeam]);
  const enemyTeamPlayers = teamPlayerInfo(battle, battle.teams[enemyTeam]);
  const myTeamScore = teamScore(battle, battle.teams[myTeam]);
  const enemyTeamScore = teamScore(battle, battle.teams[enemyTeam]);
  const currentTime = now();
  const msLeft = Math.max(0, (player.qDeadline || currentTime) - currentTime);

  socket.emit("team:resumeState", {
    roomId,
    teamMode: battle.teamMode,
    level: battle.level || "A1",
    questions,
    total_questions: questions.length,
    answeredCount: player.answeredCount,
    myScore: player.score,
    myTeam,
    myTeamPlayers,
    enemyTeamPlayers,
    myTeamScore,
    enemyTeamScore,
    msLeft,
    finished: player.finished,
  });
  logger.log(
    "Jamoa reconnect: user " + userId + " → " + roomId
    + " (savol " + player.answeredCount + ")"
  );
}

async function loadWaitingOpponent({ pool, battle, socketId }) {
  const opponent = {
    name: "Raqib",
    picture: null,
    answered: 0,
    score: 0,
    rating: null,
    id: null,
  };
  try {
    const opponentKey = Object.keys(battle.players).find(
      (key) => key !== socketId
    );
    if (opponentKey) {
      const player = battle.players[opponentKey];
      opponent.name = player.name || "Raqib";
      opponent.answered = player.answeredCount || 0;
      opponent.score = player.score || 0;
      opponent.id = player.userId || null;
      if (player.userId) {
        const result = await pool.query(
          "SELECT profile_picture, rating FROM users WHERE id = $1",
          [player.userId]
        );
        if (result.rows[0]) {
          opponent.picture = result.rows[0].profile_picture;
          opponent.rating = result.rows[0].rating;
        }
      }
    }
  } catch (error) {}
  return opponent;
}

async function resumeWaitingOpponent({ socket, pool, battle, player, roomId, userId }) {
  const stats = await loadAnswerStats({ pool, roomId, userId });
  const opponent = await loadWaitingOpponent({
    pool,
    battle,
    socketId: socket.id,
  });
  socket.emit("battle:waitingOpponent", {
    roomId,
    answeredCount: player.answeredCount,
    total: battle.questions.length,
    myScore: player.score,
    correctCount: stats.correctCount,
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    opponentName: opponent.name,
    opponentPicture: opponent.picture,
    opponentAnswered: opponent.answered,
    opponentScore: opponent.score,
    opponentRating: opponent.rating,
    opponentId: opponent.id,
  });
}

async function loadActiveOpponent({ pool, battle, socketId }) {
  const opponent = { answered: 0, id: null, name: "Raqib", picture: null };
  try {
    const opponentKey = Object.keys(battle.players).find(
      (key) => key !== socketId
    );
    if (opponentKey) {
      const player = battle.players[opponentKey];
      opponent.answered = player.answeredCount || 0;
      opponent.id = player.userId || null;
      opponent.name = player.name || "Raqib";
      if (opponent.id) {
        const result = await pool.query(
          "SELECT profile_picture FROM users WHERE id = $1",
          [opponent.id]
        );
        if (result.rows[0]) opponent.picture = result.rows[0].profile_picture;
      }
    }
  } catch (error) {}
  return opponent;
}

async function resumeActiveBattle({
  socket,
  pool,
  battle,
  player,
  roomId,
  userId,
  now,
  logger,
}) {
  const questions = safeQuestions(battle.questions);
  const currentTime = now();
  const msLeft = Math.max(0, (player.qDeadline || currentTime) - currentTime);
  const stats = await loadAnswerStats({
    pool,
    roomId,
    userId,
    onError(error) {
      logger.error("reconnect statistika xato:", error.message);
    },
  });
  const opponent = await loadActiveOpponent({
    pool,
    battle,
    socketId: socket.id,
  });

  socket.emit("battle:resumeState", {
    roomId,
    questions,
    total_questions: questions.length,
    answeredCount: player.answeredCount,
    myScore: player.score,
    correctCount: stats.correctCount,
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    msLeft,
    level: battle.level || "A1",
    opponentAnswered: opponent.answered,
    opponentId: opponent.id,
    opponentName: opponent.name,
    opponentPicture: opponent.picture,
  });
  logger.log(
    "Reconnect: user " + userId + " → " + roomId + " (savol "
    + player.answeredCount + ", " + msLeft + "ms qoldi)"
  );
}

function createReconnectHandler({
  socket,
  pool,
  battles,
  userToRoom,
  recentlyFinished,
  finishBattleSession,
  rebindPlayerSocket,
  now,
  logger,
}) {
  return async function reconnectCheck({ userId, expectedRoom }) {
    userId = socket.userId;
    if (!userId) {
      socket.emit("battle:noActive", {});
      return;
    }
    if (socket.authUserId) userId = socket.authUserId;

    const roomId = userToRoom[userId];
    const battle = roomId ? battles[roomId] : null;
    if (expectedRoom) {
      const isActiveMatch = roomId && String(roomId) === String(expectedRoom);
      const isFinishedMatch = recentlyFinished[userId]
        && String(recentlyFinished[userId]) === String(expectedRoom);
      if (!isActiveMatch && !isFinishedMatch) {
        socket.emit("battle:noActive", {});
        return;
      }
    }

    if (!roomId || !battle) {
      if (recentlyFinished[userId]) {
        socket.emit("battle:alreadyFinished", {
          roomId: recentlyFinished[userId],
        });
        return;
      }
      socket.emit("battle:noActive", {});
      return;
    }

    if (battle.createdAt && (now() - battle.createdAt) > MAX_RECONNECT_AGE_MS) {
      delete userToRoom[userId];
      finishBattleSession(roomId).catch(() => {});
      delete battles[roomId];
      socket.emit("battle:noActive", {});
      return;
    }

    rebindPlayerSocket(roomId, userId, socket.id);
    const player = battle.players[socket.id];
    if (!player || String(player.userId) !== String(userId)) {
      socket.emit("battle:noActive", {});
      return;
    }

    socket.join(roomId);
    player.disconnected = false;
    socket.to(roomId).emit("playerOnline", { userId: String(userId) });
    if (battle.isTeam) {
      resumeTeamBattle({ socket, battle, player, roomId, userId, now, logger });
      return;
    }
    if (player.finished) {
      await resumeWaitingOpponent({ socket, pool, battle, player, roomId, userId });
      return;
    }
    await resumeActiveBattle({
      socket, pool, battle, player, roomId, userId, now, logger,
    });
  };
}

function registerBattleReconnectSocket({
  socket,
  pool,
  battles,
  userToRoom,
  recentlyFinished,
  finishBattleSession,
  rebindPlayerSocket,
  now = Date.now,
  logger = console,
}) {
  socket.on("battle:reconnectCheck", createReconnectHandler({
    socket,
    pool,
    battles,
    userToRoom,
    recentlyFinished,
    finishBattleSession,
    rebindPlayerSocket,
    now,
    logger,
  }));
}

module.exports = registerBattleReconnectSocket;
