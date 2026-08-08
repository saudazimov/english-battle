const MAX_ROOM_ID_LENGTH = 256;
const { createAnswerEventService } = require("../services/answerEventService");

function hasOwn(record, key) {
  return record !== null
    && typeof record === "object"
    && Object.prototype.hasOwnProperty.call(record, key);
}

async function persistBattleAnswer({
  pool,
  roomId,
  player,
  question,
  answer,
  isCorrect,
  timedOut,
  battle,
  responseTimeMs,
  answerEventService,
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
    if (player.userId) {
      await answerEventService.recordOneSafe({
        studentId: player.userId,
        questionId: question.id,
        sourceMode: "battle",
        sourceRecordId: roomId,
        sourceQuestionId: question.id,
        selectedOption: timedOut ? null : answer,
        correctOption: question.correct_option,
        isCorrect,
        timedOut,
        responseTimeMs,
        detectedCefrLevel: battle.level,
        legacySkill: question.skill,
        eventMetadata: { mode: battle.mode || null, battle_type: battle.battleType || "1v1" },
      });
    }
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
  answerEventService,
  logger,
}) {
  return async function submitAnswer(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

    const { roomId, questionId, answer } = payload;
    if (
      typeof roomId !== "string"
      || roomId.length === 0
      || roomId.length > MAX_ROOM_ID_LENGTH
      || !hasOwn(battles, roomId)
    ) return;

    const battle = battles[roomId];
    if (!battle || !hasOwn(battle.players, socket.id)) return;

    const player = battle.players[socket.id];
    if (!player || typeof player !== "object" || Array.isArray(player)) return;
    if (player.finished) return;

    if (!player.answers) player.answers = [];
    if (!player.answeredIds) player.answeredIds = {};
    if (hasOwn(player.answeredIds, questionId) && player.answeredIds[questionId]) {
      socket.emit("answerResult", {
        already_answered: true,
        my_score: player.score,
        answered: player.answeredCount,
      });
      return;
    }

    if (!Array.isArray(battle.questions)) return;
    const question = battle.questions.find((item) => item.id === questionId);
    if (!question) return;

    const answeredAt = now();
    const deadline = player.qDeadline || (answeredAt + timePerQuestionMs);
    const responseTimeMs = player.answeredCount > 0
      ? Math.max(0, Math.min(
        timePerQuestionMs + answerGraceMs,
        answeredAt - (deadline - timePerQuestionMs - answerGraceMs)
      ))
      : null;
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
      responseTimeMs,
      answerEventService,
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
  answerEventService,
}) {
  const diagnosticEvents = answerEventService || createAnswerEventService({ pool, logger });
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
    answerEventService: diagnosticEvents,
  }));
}

module.exports = registerBattleAnswerSocket;
