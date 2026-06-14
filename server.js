const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("./db");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

// JSON ma'lumotlarni o'qiy olish uchun
app.use(express.json());
app.use(express.static("public"));
// Asosiy sahifa
app.get("/", (req, res) => {
  res.send("English Battle serveri ishlayapti!");
});

// RO'YXATDAN O'TISH (register)
app.post("/register", async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;

    // 1. Hamma maydon to'ldirilganmi tekshirish
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
    }

    // 2. Bu email allaqachon bormi tekshirish
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
    }

    // 3. Parolni shifrlash
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Foydalanuvchini bazaga saqlash
    const newUser = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password)
       VALUES ($1, $2, $3, $4)
       RETURNING id, first_name, last_name, email, cefr_level, xp, rating, coins, created_at`,
      [first_name, last_name, email, hashedPassword]
    );

    // 5. Javob qaytarish (parolsiz)
    res.status(201).json({
      message: "Ro'yxatdan o'tish muvaffaqiyatli!",
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error("Register xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});
// TIZIMGA KIRISH (login)
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Email va parol kiritilganmi
    if (!email || !password) {
      return res.status(400).json({ error: "Email va parolni kiriting" });
    }

    // 2. Foydalanuvchini email bo'yicha topish
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Email yoki parol noto'g'ri" });
    }

    const user = result.rows[0];

    // 3. Parolni tekshirish (shifrlangan parol bilan solishtirish)
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: "Email yoki parol noto'g'ri" });
    }

    // 4. Muvaffaqiyatli — foydalanuvchi ma'lumotini qaytarish (parolsiz)
    res.json({
      message: "Tizimga muvaffaqiyatli kirdingiz!",
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        cefr_level: user.cefr_level,
        xp: user.xp,
        rating: user.rating,
        coins: user.coins,
      },
    });
  } catch (err) {
    console.error("Login xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});
// ============ JANG TIZIMI ============

// 1. JANGNI BOSHLASH - savollarni olish
app.get("/battle/start", async (req, res) => {
  try {
    const level = req.query.level || "A1";

    // Shu darajadagi 5 ta tasodifiy savol olish
    const result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, skill
       FROM questions
       WHERE cefr_level = $1
       ORDER BY RANDOM()
       LIMIT 5`,
      [level]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Bu daraja uchun savol topilmadi" });
    }

    // DIQQAT: correct_option YUBORILMAYDI! (firibgarlikni oldini olish)
    res.json({
      message: "Jang boshlandi!",
      level: level,
      total_questions: result.rows.length,
      questions: result.rows,
    });
  } catch (err) {
    console.error("Jang boshlashda xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// 2. JAVOBLARNI TEKSHIRISH - ballni hisoblash
app.post("/battle/submit", async (req, res) => {
  try {
    // answers = [{ question_id: 1, answer: "B" }, ...]
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: "Javoblar yuborilmadi" });
    }

    let correctCount = 0;
    const results = [];

    // Har bir javobni bazadagi to'g'ri javob bilan solishtirish
    for (const ans of answers) {
      const q = await pool.query(
        "SELECT correct_option, explanation FROM questions WHERE id = $1",
        [ans.question_id]
      );

      if (q.rows.length > 0) {
        const correct = q.rows[0].correct_option;
        const isCorrect = correct === ans.answer;
        if (isCorrect) correctCount++;

        results.push({
          question_id: ans.question_id,
          your_answer: ans.answer,
          correct_answer: correct,
          is_correct: isCorrect,
          explanation: q.rows[0].explanation,
        });
      }
    }

    const total = answers.length;
    const accuracy = Math.round((correctCount / total) * 100);
    const xpEarned = correctCount * 10;

    res.json({
      message: "Jang tugadi!",
      score: `${correctCount}/${total}`,
      correct: correctCount,
      total: total,
      accuracy: accuracy + "%",
      xp_earned: xpEarned,
      results: results,
    });
  } catch (err) {
    console.error("Javob tekshirishda xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});
// ============ SOCKET.IO (REAL-TIME) ============

// ============ BOT RAQIB ============

// Bot uchun tasodifiy ismlar
const BOT_NAMES = ["Aziz", "Malika", "Bobur", "Nigora", "Sardor", "Dilnoza", "Jahongir", "Zarina"];

function getRandomBotName() {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

// Bot bilan jang boshlash
async function startBotBattle(roomId, humanPlayer) {
  try {
    const result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT 5`,
      [humanPlayer.level]
    );

    const questions = result.rows;
    const botId = "bot_" + roomId;

    // Jang holatini saqlash (bot ham bor)
    battles[roomId] = {
      questions: questions,
      isBot: true,
      botId: botId,
      players: {
        [humanPlayer.socketId]: { userId: humanPlayer.userId, name: humanPlayer.name, score: 0, finished: false, answeredCount: 0 },
        [botId]: { userId: null, name: humanPlayer.botName, score: 0, finished: false, answeredCount: 0, isBot: true },
      },
    };

    // Savollarni o'yinchiga yuborish (to'g'ri javobsiz)
    const safeQuestions = questions.map((q) => ({
      id: q.id, question_text: q.question_text,
      option_a: q.option_a, option_b: q.option_b,
      option_c: q.option_c, option_d: q.option_d,
    }));

    io.to(humanPlayer.socketId).emit("battleStart", {
      total_questions: safeQuestions.length,
      questions: safeQuestions,
    });

    console.log("Bot bilan jang boshlandi:", roomId);

    // Botning javoblarini "simulyatsiya" qilish
    simulateBotAnswers(roomId, botId, questions);
  } catch (err) {
    console.error("Bot jang xatosi:", err.message);
  }
}

// Bot javoblarini taqlid qilish
function simulateBotAnswers(roomId, botId, questions) {
  let qIndex = 0;

  function answerNext() {
    const battle = battles[roomId];
    if (!battle || !battle.players[botId]) return; // jang tugagan bo'lsa to'xta

    if (qIndex >= questions.length) {
      // Bot hamma savolga javob berdi
      battle.players[botId].finished = true;
      const allFinished = Object.values(battle.players).every((p) => p.finished);
      if (allFinished) finishBattle(roomId);
      return;
    }

    const question = questions[qIndex];
    const bot = battle.players[botId];

    // Bot 65% ehtimol bilan to'g'ri javob beradi
    const isCorrect = Math.random() < 0.65;
    if (isCorrect) bot.score++;
    bot.answeredCount++;

    // O'yinchiga botning progressini ko'rsatish
    io.to(roomId).emit("opponentProgress", { answeredCount: bot.answeredCount });

    qIndex++;

    // Bot tugatdimi?
    if (bot.answeredCount >= questions.length) {
      bot.finished = true;
      const allFinished = Object.values(battle.players).every((p) => p.finished);
      if (allFinished) finishBattle(roomId);
      return;
    }

    // Keyingi javob uchun tasodifiy vaqt (3-8 soniya) — inson kabi
    const delay = 3000 + Math.random() * 5000;
    setTimeout(answerNext, delay);
  }

  // Birinchi javobni boshlash (2-5 soniyadan keyin)
  setTimeout(answerNext, 2000 + Math.random() * 3000);
}

let waitingPlayer = null;
const battles = {}; // Faol janglar: roomId -> jang ma'lumoti

// Jangni boshlash funksiyasi
async function startBattle(roomId, player1, player2) {
  try {
    // 5 ta tasodifiy savol olish
    const result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT 5`,
      [player1.level]
    );

    const questions = result.rows;

    // Jang holatini saqlash
    battles[roomId] = {
      questions: questions,
      players: {
        [player1.socketId]: { userId: player1.userId, name: player1.name, score: 0, finished: false, answeredCount: 0 },
        [player2.socketId]: { userId: player2.userId, name: player2.name, score: 0, finished: false, answeredCount: 0 },
      },
    };

    // To'g'ri javobsiz savollarni o'yinchilarga yuborish
    const safeQuestions = questions.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
    }));

    io.to(roomId).emit("battleStart", {
      total_questions: safeQuestions.length,
      questions: safeQuestions,
    });

    console.log("Jang boshlandi, xona:", roomId);
  } catch (err) {
    console.error("Jang boshlashda xato:", err.message);
  }
}

io.on("connection", (socket) => {
  console.log("Yangi o'yinchi ulandi:", socket.id);

  socket.on("findMatch", (playerData) => {
    console.log("Jang qidirilyapti:", socket.id);

    if (waitingPlayer === null) {
      const botName = getRandomBotName();
      waitingPlayer = {
        socketId: socket.id,
        userId: playerData.userId,
        name: playerData.name || "O'yinchi",
        level: playerData.level || "A1",
        botName: botName,
      };
      socket.emit("waiting", { message: "Raqib qidirilmoqda..." });

      // 10 soniyadan keyin haqiqiy raqib topilmasa, bot qo'shamiz
      const waitingSocketId = socket.id;
      setTimeout(() => {
        // Agar shu o'yinchi hali ham kutayotgan bo'lsa (raqib topilmagan)
        if (waitingPlayer && waitingPlayer.socketId === waitingSocketId) {
          const player = waitingPlayer;
          waitingPlayer = null;

          const roomId = "battle_bot_" + player.socketId;
          io.sockets.sockets.get(player.socketId)?.join(roomId);

          // O'yinchiga "raqib topildi" (aslida bot)
          io.to(player.socketId).emit("matchFound", {
            roomId: roomId,
            opponent: { name: player.botName },
            message: "Raqib topildi!",
          });

          // 2 soniyadan keyin bot bilan jang boshlanadi
          setTimeout(() => startBotBattle(roomId, player), 2000);
        }
      }, 10000); // 10 soniya
    } else {
      const opponent = waitingPlayer;
      waitingPlayer = null;

      const roomId = "battle_" + opponent.socketId + "_" + socket.id;
      socket.join(roomId);
      io.sockets.sockets.get(opponent.socketId)?.join(roomId);

      const player1 = opponent;
      const player2 = { socketId: socket.id, userId: playerData.userId, name: playerData.name || "O'yinchi", level: playerData.level || "A1" };
      io.to(opponent.socketId).emit("matchFound", {
        roomId, opponent: { name: player2.name }, message: "Raqib topildi!",
      });
      socket.emit("matchFound", {
        roomId, opponent: { name: player1.name }, message: "Raqib topildi!",
      });

      // 2 soniyadan keyin jangni boshlaymiz
      setTimeout(() => startBattle(roomId, player1, player2), 2000);
    }
  });

  // O'yinchi javob yuboradi
  socket.on("submitAnswer", ({ roomId, questionId, answer }) => {
    const battle = battles[roomId];
    if (!battle || !battle.players[socket.id]) return;

    const player = battle.players[socket.id];
    if (player.finished) return;

    // To'g'ri javobni serverda tekshirish
    const question = battle.questions.find((q) => q.id === questionId);
    if (question && question.correct_option === answer) {
      player.score++;
    }
    player.answeredCount++;

    // Raqibga jonli progress yuborish
    socket.to(roomId).emit("opponentProgress", {
      answeredCount: player.answeredCount,
    });

    // Bu o'yinchi hamma savolga javob berdimi?
    if (player.answeredCount >= battle.questions.length) {
      player.finished = true;

      // Ikkala o'yinchi ham tugatdimi?
      const allFinished = Object.values(battle.players).every((p) => p.finished);
      if (allFinished) {
        finishBattle(roomId);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("O'yinchi uzildi:", socket.id);
    if (waitingPlayer && waitingPlayer.socketId === socket.id) {
      waitingPlayer = null;
    }
  });
});

// Jangni yakunlash va g'olibni aniqlash
async function finishBattle(roomId) {
  const battle = battles[roomId];
  if (!battle) return;

  const playerIds = Object.keys(battle.players);
  const p1 = battle.players[playerIds[0]];
  const p2 = battle.players[playerIds[1]];

  let winnerId = null;
  if (p1.score > p2.score) winnerId = playerIds[0];
  else if (p2.score > p1.score) winnerId = playerIds[1];

  // Reyting o'zgarishi (oddiy tizim)
  const RATING_CHANGE = 20;

  for (const id of playerIds) {
    const me = battle.players[id];
    const opponentId = playerIds.find((pid) => pid !== id);
    const opp = battle.players[opponentId];

    let outcome = "draw";
    let ratingDelta = 0;
    if (winnerId === id) {
      outcome = "win";
      ratingDelta = RATING_CHANGE;
    } else if (winnerId !== null) {
      outcome = "lose";
      ratingDelta = -RATING_CHANGE;
    }

    const xpEarned = me.score * 10 + (outcome === "win" ? 20 : 0);

    // BAZAGA SAQLASH (agar userId bor bo'lsa)
    let updatedUser = null;
    if (me.userId) {
      try {
        const result = await pool.query(
          `UPDATE users
           SET xp = xp + $1,
               rating = GREATEST(0, rating + $2)
           WHERE id = $3
           RETURNING id, first_name, last_name, email, cefr_level, xp, rating, coins`,
          [xpEarned, ratingDelta, me.userId]
        );
        if (result.rows.length > 0) {
          updatedUser = result.rows[0];
        }
      } catch (err) {
        console.error("Natijani saqlashda xato:", err.message);
      }
    }

    // O'yinchiga natija yuborish (yangilangan ma'lumot bilan)
    io.to(id).emit("battleEnd", {
      outcome: outcome,
      your_score: me.score,
      opponent_score: opp.score,
      total: battle.questions.length,
      xp_earned: xpEarned,
      rating_change: ratingDelta,
      updated_user: updatedUser,
    });
  }

  console.log("Jang tugadi va saqlandi, xona:", roomId);
  delete battles[roomId];
}

// ============ LEADERBOARD ============
app.get("/leaderboard", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, xp
       FROM users
       ORDER BY rating DESC, xp DESC
       LIMIT 50`
    );
    res.json({ players: result.rows });
  } catch (err) {
    console.error("Leaderboard xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// DIQQAT: app.listen emas, server.listen!
server.listen(PORT, () => {
  console.log("Server ishga tushdi: http://localhost:3000");
});