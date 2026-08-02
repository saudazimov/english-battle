const MAX_ROOM_ID_LENGTH = 256;

function hasOwn(record, key) {
  return record !== null
    && typeof record === "object"
    && Object.prototype.hasOwnProperty.call(record, key);
}

function createSubmitTeamAnswerHandler({
  socket,
  io,
  pool,
  battles,
  emitTeamProgress,
  checkTeamFinish,
  timePerQuestionMs,
  answerGraceMs,
  now,
  logger,
}) {
  return async function submitTeamAnswer(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

    const { roomId, questionId, answer } = payload;
    if (
      typeof roomId !== "string"
      || roomId.length === 0
      || roomId.length > MAX_ROOM_ID_LENGTH
      || !hasOwn(battles, roomId)
    ) return;

    const battle = battles[roomId];
    if (!battle || !battle.isTeam) return;
    if (!hasOwn(battle.players, socket.id)) return;
    const player = battle.players[socket.id];
    if (!player || typeof player !== "object" || Array.isArray(player)) return;
    if (player.finished) return;

    if (!player.answeredIds) player.answeredIds = {};
    if (hasOwn(player.answeredIds, questionId) && player.answeredIds[questionId]) {
      io.to(socket.id).emit("teamAnswerResult", {
        already_answered: true,
        answeredCount: player.answeredCount,
        total: battle.questions.length,
        myScore: player.score,
      });
      return;
    }

    if (!Array.isArray(battle.questions)) return;
    const question = battle.questions.find(function (item) {
      return item.id === questionId;
    });
    if (!question) return;

    const answeredAt = now();
    const deadline = player.qDeadline || (answeredAt + timePerQuestionMs);
    const noAnswer = answer === null || answer === undefined || answer === "";
    const timedOut = noAnswer || answeredAt > deadline;

    let isCorrect = false;
    if (!timedOut) {
      isCorrect = answer === question.correct_option;
      if (isCorrect) player.score++;
    }

    player.answeredCount++;
    player.answeredIds[questionId] = true;
    player.qDeadline = answeredAt + timePerQuestionMs + answerGraceMs;
    player.answers.push({
      questionId: question.id,
      selected: timedOut ? null : answer,
      correct: question.correct_option,
      isCorrect,
      timedOut,
    });
    if (player.answeredCount >= battle.questions.length) player.finished = true;

    try {
      await pool.query(
        `INSERT INTO battle_answers
           (room_id, user_id, question_id, q_order, selected_option,
            correct_option, is_correct, timed_out, skill, cefr_level)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (room_id, user_id, question_id) DO NOTHING`,
        [
          roomId,
          player.userId || null,
          question.id,
          player.answeredCount,
          timedOut ? null : answer,
          question.correct_option,
          isCorrect,
          timedOut,
          question.skill || null,
          battle.level || null,
        ]
      );
    } catch (error) {
      logger.error("team battle_answers yozish xato:", error.message);
    }

    io.to(socket.id).emit("teamAnswerResult", {
      isCorrect,
      timed_out: timedOut,
      correct_option: question.correct_option,
      answeredCount: player.answeredCount,
      total: battle.questions.length,
      myScore: player.score,
    });
    emitTeamProgress(roomId);
    checkTeamFinish(roomId);
  };
}

function registerTeamBattleAnswerSocket({
  socket,
  io,
  pool,
  battles,
  emitTeamProgress,
  checkTeamFinish,
  timePerQuestionMs,
  answerGraceMs,
  now = Date.now,
  logger = console,
}) {
  socket.on("submitTeamAnswer", createSubmitTeamAnswerHandler({
    socket,
    io,
    pool,
    battles,
    emitTeamProgress,
    checkTeamFinish,
    timePerQuestionMs,
    answerGraceMs,
    now,
    logger,
  }));
}

module.exports = registerTeamBattleAnswerSocket;
