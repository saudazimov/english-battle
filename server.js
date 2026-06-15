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
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
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
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
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

    // O'yinchining javoblarini saqlash (xatolar tahlili uchun)
    if (!player.answers) player.answers = [];

    // To'g'ri javobni serverda tekshirish
    const question = battle.questions.find((q) => q.id === questionId);
    const isCorrect = question && question.correct_option === answer;
    if (isCorrect) {
      player.score++;
    }
    player.answeredCount++;

    // Javobni eslab qolish
    if (question) {
      player.answers.push({
        question_id: questionId,
        question_text: question.question_text,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
        your_answer: answer,
        correct_answer: question.correct_option,
        is_correct: isCorrect,
        explanation: question.explanation || "",
      });
    }

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

// ============ TOPSHIRIQ (QUEST) YORDAMCHILARI ============

// O'yinchining bugungi topshiriqlarini olish (yo'q bo'lsa — yaratish)
async function getOrCreateDailyQuests(userId) {
  // Bugungi topshiriqlar bormi?
  const existing = await pool.query(
    `SELECT uq.id, uq.quest_id, uq.progress, uq.is_completed, uq.reward_claimed,
            q.quest_type, q.target, q.xp_reward, q.title, q.description
     FROM user_quests uq
     JOIN quests q ON uq.quest_id = q.id
     WHERE uq.user_id = $1 AND uq.quest_date = CURRENT_DATE`,
    [userId]
  );

  if (existing.rows.length > 0) {
    return existing.rows;
  }

  // Yo'q — bugun uchun yangi topshiriqlar yaratamiz (3 tasini tasodifiy)
  const allQuests = await pool.query(
    "SELECT id FROM quests WHERE is_active = true ORDER BY RANDOM() LIMIT 3"
  );

  for (const q of allQuests.rows) {
    await pool.query(
      `INSERT INTO user_quests (user_id, quest_id, quest_date)
       VALUES ($1, $2, CURRENT_DATE)
       ON CONFLICT (user_id, quest_id, quest_date) DO NOTHING`,
      [userId, q.id]
    );
  }

  // Yangi yaratilganlarni qaytarish
  const created = await pool.query(
    `SELECT uq.id, uq.quest_id, uq.progress, uq.is_completed, uq.reward_claimed,
            q.quest_type, q.target, q.xp_reward, q.title, q.description
     FROM user_quests uq
     JOIN quests q ON uq.quest_id = q.id
     WHERE uq.user_id = $1 AND uq.quest_date = CURRENT_DATE`,
    [userId]
  );
  return created.rows;
}

// Jang natijasiga qarab topshiriq progressini yangilash
async function updateQuestProgress(userId, { won, correctAnswers, xpEarned }) {
  try {
    const quests = await getOrCreateDailyQuests(userId);

    for (const uq of quests) {
      if (uq.is_completed) continue; // allaqachon bajarilgan

      let increment = 0;
      if (uq.quest_type === "play_battles") increment = 1;
      else if (uq.quest_type === "win_battles") increment = won ? 1 : 0;
      else if (uq.quest_type === "correct_answers") increment = correctAnswers;
      else if (uq.quest_type === "earn_xp") increment = xpEarned;

      if (increment > 0) {
        const newProgress = uq.progress + increment;
        const completed = newProgress >= uq.target;

        await pool.query(
          `UPDATE user_quests
           SET progress = $1, is_completed = $2
           WHERE id = $3`,
          [Math.min(newProgress, uq.target), completed, uq.id]
        );
      }
    }
  } catch (err) {
    console.error("Quest progress xatosi:", err.message);
  }
}

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

        // Jang tarixiga yozish
        await pool.query(
          `INSERT INTO battle_history
           (user_id, opponent_name, my_score, opponent_score, outcome, xp_earned, rating_change, cefr_level)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [me.userId, opp.name, me.score, opp.score, outcome, xpEarned, ratingDelta, "A1"]
        );
        // Topshiriqlar progressini yangilash
        await updateQuestProgress(me.userId, {
          won: outcome === "win",
          correctAnswers: me.score,
          xpEarned: xpEarned,
        });

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
      answers: me.answers || [],
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

// ============ ADMIN PANEL ============

// Admin parolni tekshirish (yordamchi)
function checkAdminPassword(password) {
  return password === process.env.ADMIN_PASSWORD;
}

// Barcha savollarni olish (admin uchun, to'g'ri javob bilan)
app.post("/admin/questions", async (req, res) => {
  try {
    const { password } = req.body;
    if (!checkAdminPassword(password)) {
      return res.status(401).json({ error: "Noto'g'ri parol" });
    }

    const result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d,
              correct_option, cefr_level, skill, difficulty
       FROM questions ORDER BY id DESC`
    );
    res.json({ questions: result.rows });
  } catch (err) {
    console.error("Admin savollar xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Yangi savol qo'shish
app.post("/admin/questions/add", async (req, res) => {
  try {
    const { password, question_text, option_a, option_b, option_c, option_d,
            correct_option, cefr_level, skill, explanation } = req.body;

    if (!checkAdminPassword(password)) {
      return res.status(401).json({ error: "Noto'g'ri parol" });
    }

    // Tekshirish
    if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
      return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
    }

    // To'g'ri javob A/B/C/D bo'lishi kerak
    if (!["A", "B", "C", "D"].includes(correct_option)) {
      return res.status(400).json({ error: "To'g'ri javob A, B, C yoki D bo'lishi kerak" });
    }

    const result = await pool.query(
      `INSERT INTO questions
       (question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, difficulty, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'easy', $9)
       RETURNING id`,
      [question_text, option_a, option_b, option_c, option_d, correct_option,
       cefr_level || "A1", skill || "grammar", explanation || ""]
    );

    res.json({ message: "Savol qo'shildi!", id: result.rows[0].id });
  } catch (err) {
    console.error("Savol qo'shish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Savolni o'chirish
app.post("/admin/questions/delete", async (req, res) => {
  try {
    const { password, id } = req.body;
    if (!checkAdminPassword(password)) {
      return res.status(401).json({ error: "Noto'g'ri parol" });
    }

    await pool.query("DELETE FROM questions WHERE id = $1", [id]);
    res.json({ message: "Savol o'chirildi!" });
  } catch (err) {
    console.error("Savol o'chirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ JANG TARIXI ============
app.get("/history/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await pool.query(
      `SELECT opponent_name, my_score, opponent_score, outcome, xp_earned, rating_change, played_at
       FROM battle_history
       WHERE user_id = $1
       ORDER BY played_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json({ history: result.rows });
  } catch (err) {
    console.error("Tarix xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ STREAK ============
app.post("/streak/checkin", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId kerak" });

    // Foydalanuvchining streak ma'lumotini olish
    const userResult = await pool.query(
      "SELECT current_streak, longest_streak, last_active_date FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }

    const user = userResult.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // bugun (vaqtsiz)

    let currentStreak = user.current_streak || 0;
    let longestStreak = user.longest_streak || 0;
    const lastActive = user.last_active_date ? new Date(user.last_active_date) : null;

    if (lastActive) {
      lastActive.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today - lastActive) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // Bugun allaqachon kirgan — o'zgartirmaymiz
        return res.json({
          current_streak: currentStreak,
          longest_streak: longestStreak,
          already_checked: true,
        });
      } else if (diffDays === 1) {
        // Kecha kirgan, bugun ham keldi — streak +1
        currentStreak++;
      } else {
        // Bir kundan ko'p o'tdi — streak uzildi, qaytadan
        currentStreak = 1;
      }
    } else {
      // Birinchi marta — streak 1
      currentStreak = 1;
    }

    // Eng uzun streakni yangilash
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }

    // Bazaga saqlash
    await pool.query(
      `UPDATE users
       SET current_streak = $1, longest_streak = $2, last_active_date = CURRENT_DATE
       WHERE id = $3`,
      [currentStreak, longestStreak, userId]
    );

    res.json({
      current_streak: currentStreak,
      longest_streak: longestStreak,
      already_checked: false,
    });
  } catch (err) {
    console.error("Streak xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ TOPSHIRIQLAR ENDPOINT ============

// O'yinchining bugungi topshiriqlarini olish
app.post("/quests", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId kerak" });

    const quests = await getOrCreateDailyQuests(userId);
    res.json({ quests: quests });
  } catch (err) {
    console.error("Quests xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Mukofotni olish (bajarilgan topshiriq uchun)
app.post("/quests/claim", async (req, res) => {
  try {
    const { userId, userQuestId } = req.body;
    if (!userId || !userQuestId) return res.status(400).json({ error: "Ma'lumot yetishmaydi" });

    // Topshiriqni tekshirish
    const result = await pool.query(
      `SELECT uq.is_completed, uq.reward_claimed, q.xp_reward
       FROM user_quests uq
       JOIN quests q ON uq.quest_id = q.id
       WHERE uq.id = $1 AND uq.user_id = $2`,
      [userQuestId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Topshiriq topilmadi" });
    }

    const quest = result.rows[0];

    if (!quest.is_completed) {
      return res.status(400).json({ error: "Topshiriq hali bajarilmagan" });
    }
    if (quest.reward_claimed) {
      return res.status(400).json({ error: "Mukofot allaqachon olingan" });
    }

    // Mukofotni berish: XP qo'shish + claimed belgilash
    await pool.query("UPDATE user_quests SET reward_claimed = true WHERE id = $1", [userQuestId]);

    const updated = await pool.query(
      `UPDATE users SET xp = xp + $1 WHERE id = $2
       RETURNING id, first_name, last_name, email, cefr_level, xp, rating, coins`,
      [quest.xp_reward, userId]
    );

    res.json({
      message: "Mukofot olindi!",
      xp_reward: quest.xp_reward,
      updated_user: updated.rows[0],
    });
  } catch (err) {
    console.error("Mukofot xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ PROFIL STATISTIKA ============
app.get("/profile/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    // Asosiy foydalanuvchi ma'lumoti
    const userResult = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, xp, coins,
              current_streak, longest_streak
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }

    const user = userResult.rows[0];

    // Jang statistikasi (battle_history dan)
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) AS total_battles,
         COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
         COUNT(*) FILTER (WHERE outcome = 'lose') AS loses,
         COUNT(*) FILTER (WHERE outcome = 'draw') AS draws,
         COALESCE(SUM(my_score), 0) AS total_correct,
         COALESCE(SUM(opponent_score), 0) AS opp_total
       FROM battle_history WHERE user_id = $1`,
      [userId]
    );

    const stats = statsResult.rows[0];
    const totalBattles = parseInt(stats.total_battles);
    const wins = parseInt(stats.wins);

    // Win rate hisoblash (foiz)
    const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;

    res.json({
      user: user,
      stats: {
        total_battles: totalBattles,
        wins: wins,
        loses: parseInt(stats.loses),
        draws: parseInt(stats.draws),
        win_rate: winRate,
        total_correct: parseInt(stats.total_correct),
      },
    });
  } catch (err) {
    console.error("Profil xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// DIQQAT: app.listen emas, server.listen!
server.listen(PORT, () => {
  console.log("Server ishga tushdi: http://localhost:3000");
});