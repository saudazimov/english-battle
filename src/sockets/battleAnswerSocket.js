async function persistBattleAnswer({
  pool,
  roomId,
  player,
  question,
  answer,
  isCorrect,
  timedOut,
  battle,
  logger,
}) {
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
    logger.error("battle_answers yozish xato:", error.message);
  }
}

function recordPlayerAnswer({
  player,
  question,
  questionId,
  answer,
  isCorrect,
  timedOut,
  answeredAt,
  timePerQuestionMs,
  answerGraceMs,
}) {
  player.answeredCount++;
  player.answeredIds[questionId] = true;
  player.qDeadline = answeredAt + timePerQuestionMs + answerGraceMs;
  player.answers.push({
    question_id: questionId,
    question_text: question.question_text,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
    your_answer: timedOut ? null : answer,
    correct_answer: question.correct_option,
    is_correct: isCorrect,
    timed_out: timedOut,
    explanation: question.explanation || "",
  });
}

function createSubmitAnswerHandler({
  socket,
  pool,
  battles,
  saveBattleSession,
  finishBattle,
  timePerQuestionMs,
  answerGraceMs,
  now,
  logger,
}) {
  return async function submitAnswer({ roomId, questionId, answer }) {
    const battle = battles[roomId];
    if (!battle || !battle.players[socket.id]) return;

    const player = battle.players[socket.id];
    if (player.finished) return;

    if (!player.answers) player.answers = [];
    if (!player.answeredIds) player.answeredIds = {};
    if (player.answeredIds[questionId]) {
      socket.emit("answerResult", {
        already_answered: true,
        my_score: player.score,
        answered: player.answeredCount,
      });
      return;
    }

    const question = battle.questions.find((item) => item.id === questionId);
    if (!question) return;

    const answeredAt = now();
    const deadline = player.qDeadline || (answeredAt + timePerQuestionMs);
    const noAnswer = answer === null || answer === undefined || answer === "";
    const timedOut = noAnswer || answeredAt > deadline;
    let isCorrect = false;
    if (!timedOut) {
      isCorrect = question.correct_option === answer;
      if (isCorrect) player.score++;
    }

    recordPlayerAnswer({
      player,
      question,
      questionId,
      answer,
      isCorrect,
      timedOut,
      answeredAt,
      timePerQuestionMs,
      answerGraceMs,
    });
    await persistBattleAnswer({
      pool,
      roomId,
      player,
      question,
      answer,
      isCorrect,
      timedOut,
      battle,
      logger,
    });

    saveBattleSession(roomId, battle);
    socket.emit("answerResult", {
      is_correct: isCorrect,
      timed_out: timedOut,
      correct_answer: question.correct_option,
      my_score: player.score,
      answered: player.answeredCount,
    });
    if (timedOut) {
      socket.emit("battle:answerTimeout", { questionId });
    }
    socket.to(roomId).emit("opponentProgress", {
      answeredCount: player.answeredCount,
    });

    if (player.answeredCount >= battle.questions.length) {
      player.finished = true;
      const allFinished = Object.values(battle.players).every(
        (battlePlayer) => battlePlayer.finished
      );
      if (allFinished) finishBattle(roomId);
    }
  };
}

function registerBattleAnswerSocket({
  socket,
  pool,
  battles,
  saveBattleSession,
  finishBattle,
  timePerQuestionMs,
  answerGraceMs,
  now = Date.now,
  logger = console,
}) {
  socket.on("submitAnswer", createSubmitAnswerHandler({
    socket,
    pool,
    battles,
    saveBattleSession,
    finishBattle,
    timePerQuestionMs,
    answerGraceMs,
    now,
    logger,
  }));
}

module.exports = registerBattleAnswerSocket;
