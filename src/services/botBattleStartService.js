function createBotBattleStartService({
  pool,
  io,
  battles,
  userToRoom,
  lengthConfig,
  saveBattleSession,
  simulateBotAnswers,
  firstQuestionGraceMs,
  timePerQuestionMs,
  logger = console,
  now = () => Date.now(),
}) {
  return async function startBotBattle(roomId, humanPlayer) {
    try {
      const qCount = lengthConfig(humanPlayer.lengthKey).questions;
      let result = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, skill
         FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2`,
        [humanPlayer.level, qCount]
      );

      if (result.rows.length === 0) {
        logger.log("'" + humanPlayer.level + "' uchun savol yo'q — zaxira savollar olinmoqda");
        result = await pool.query(
          `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
           FROM questions ORDER BY RANDOM() LIMIT $1`,
          [qCount]
        );
      }

      const questions = result.rows;
      if (questions.length === 0) {
        io.to(humanPlayer.socketId).emit("battleError", {
          message: "Hozircha savollar mavjud emas. Keyinroq urinib ko'ring.",
        });
        logger.error("Bazada umuman savol yo'q!");
        return;
      }

      const botId = "bot_" + roomId;
      battles[roomId] = {
        questions,
        isBot: true,
        botId,
        level: humanPlayer.level || "A1",
        lengthKey: humanPlayer.lengthKey || "standard",
        mode: humanPlayer.mode || "ranked",
        createdAt: now(),
        players: {
          [humanPlayer.socketId]: {
            userId: humanPlayer.userId,
            name: humanPlayer.name,
            score: 0,
            finished: false,
            answeredCount: 0,
            answeredIds: {},
            qDeadline: now() + firstQuestionGraceMs + timePerQuestionMs,
          },
          [botId]: {
            userId: null,
            name: humanPlayer.botName,
            score: 0,
            finished: false,
            answeredCount: 0,
            isBot: true,
          },
        },
      };

      const safeQuestions = questions.map((question) => ({
        id: question.id,
        question_text: question.question_text,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
      }));

      let myPic = null;
      if (humanPlayer.userId) {
        try {
          const profile = await pool.query(
            "SELECT profile_picture FROM users WHERE id = $1",
            [humanPlayer.userId]
          );
          if (profile.rows[0]) myPic = profile.rows[0].profile_picture;
        } catch (profileLookupError) {
          void profileLookupError;
        }
      }

      io.to(humanPlayer.socketId).emit("battleStart", {
        total_questions: safeQuestions.length,
        questions: safeQuestions,
        myPicture: myPic,
        opponentPicture: null,
        opponentName: humanPlayer.botName,
        opponentId: null,
        myName: humanPlayer.name,
        level: humanPlayer.level || "A1",
      });
      logger.log("Bot bilan jang boshlandi:", roomId);

      battles[roomId].battleType = "1v1";
      battles[roomId].players[humanPlayer.socketId].socketId = humanPlayer.socketId;
      if (humanPlayer.userId) userToRoom[humanPlayer.userId] = roomId;
      await saveBattleSession(roomId, battles[roomId]);
      simulateBotAnswers(roomId, botId, questions);
    } catch (error) {
      logger.error("Bot jang xatosi:", error.message);
    }
  };
}

module.exports = { createBotBattleStartService };
