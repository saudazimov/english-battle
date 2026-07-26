function clientQuestions(questions) {
  return questions.map((question) => ({
    id: question.id,
    question_text: question.question_text,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
  }));
}

async function loadProfilePictures(pool, player1, player2) {
  let pic1 = null;
  let pic2 = null;
  try {
    const result = await pool.query(
      "SELECT id, profile_picture FROM users WHERE id = ANY($1)",
      [[player1.userId, player2.userId]]
    );
    result.rows.forEach((row) => {
      if (String(row.id) === String(player1.userId)) pic1 = row.profile_picture;
      if (String(row.id) === String(player2.userId)) pic2 = row.profile_picture;
    });
  } catch (profileLookupError) {
    void profileLookupError;
  }
  return { pic1, pic2 };
}

function battlePlayer(player, deadline) {
  return {
    userId: player.userId,
    name: player.name,
    score: 0,
    finished: false,
    answeredCount: 0,
    answeredIds: {},
    qDeadline: deadline,
  };
}

function createBattleStartService({
  pool,
  io,
  battles,
  userToRoom,
  lengthConfig,
  saveBattleSession,
  firstQuestionGraceMs,
  timePerQuestionMs,
  logger = console,
  now = () => Date.now(),
}) {
  return async function startBattle(roomId, player1, player2) {
    try {
      const qCount = lengthConfig(player1.lengthKey).questions;
      logger.log(
        "[BATTLE DEBUG] startBattle. player1.lengthKey:", player1.lengthKey,
        "| qCount (kerakli):", qCount, "| level:", player1.level
      );

      let result = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, skill
         FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2`,
        [player1.level, qCount]
      );
      if (result.rows.length === 0) {
        logger.log("'" + player1.level + "' uchun savol yo'q — zaxira savollar olinmoqda");
        result = await pool.query(
          `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
           FROM questions ORDER BY RANDOM() LIMIT $1`,
          [qCount]
        );
      }

      const questions = result.rows;
      logger.log(
        "[BATTLE DEBUG] Bazadan olingan savollar soni:", questions.length,
        "(kerakli:", qCount, ")"
      );
      if (questions.length === 0) {
        io.to(player1.socketId).emit("battleError", {
          message: "Hozircha savollar mavjud emas. Keyinroq urinib ko'ring.",
        });
        io.to(player2.socketId).emit("battleError", {
          message: "Hozircha savollar mavjud emas. Keyinroq urinib ko'ring.",
        });
        logger.error("Bazada umuman savol yo'q!");
        return;
      }

      const deadlineOffset = firstQuestionGraceMs + timePerQuestionMs;
      battles[roomId] = {
        questions,
        level: player1.level || "A1",
        lengthKey: player1.lengthKey || "standard",
        mode: player1.mode || "ranked",
        createdAt: now(),
        players: {
          [player1.socketId]: battlePlayer(player1, now() + deadlineOffset),
          [player2.socketId]: battlePlayer(player2, now() + deadlineOffset),
        },
      };

      const questionsForClient = clientQuestions(questions);
      const { pic1, pic2 } = await loadProfilePictures(pool, player1, player2);
      io.to(player1.socketId).emit("battleStart", {
        total_questions: questionsForClient.length,
        questions: questionsForClient,
        myPicture: pic1,
        opponentPicture: pic2,
        opponentName: player2.name,
        opponentId: player2.userId,
        myName: player1.name,
        level: player1.level,
      });
      io.to(player2.socketId).emit("battleStart", {
        total_questions: questionsForClient.length,
        questions: questionsForClient,
        myPicture: pic2,
        opponentPicture: pic1,
        opponentName: player1.name,
        opponentId: player1.userId,
        myName: player2.name,
        level: player2.level,
      });
      logger.log("Jang boshlandi, xona:", roomId);

      battles[roomId].battleType = "1v1";
      await saveBattleSession(roomId, battles[roomId]);
      if (player1.userId) userToRoom[player1.userId] = roomId;
      if (player2.userId) userToRoom[player2.userId] = roomId;
      if (battles[roomId].players[player1.socketId]) {
        battles[roomId].players[player1.socketId].socketId = player1.socketId;
      }
      if (battles[roomId].players[player2.socketId]) {
        battles[roomId].players[player2.socketId].socketId = player2.socketId;
      }
    } catch (error) {
      logger.error("Jang boshlashda xato:", error.message);
    }
  };
}

module.exports = { createBattleStartService };
