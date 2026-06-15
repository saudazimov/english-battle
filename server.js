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
    const {
      first_name, last_name, phone, password,
      birth_date, birth_year, region, district, village, school
    } = req.body;

    // Majburiy maydonlar
    if (!first_name || !last_name || !phone || !password) {
      return res.status(400).json({ error: "Ism, familiya, telefon va parol majburiy" });
    }

    // Telefon allaqachon ro'yxatdan o'tganmi
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Bu telefon raqami allaqachon ro'yxatdan o'tgan" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      `INSERT INTO users
       (first_name, last_name, phone, password, birth_date, birth_year, region, district, village, school)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, first_name, last_name, phone, cefr_level, xp, rating, coins,
                 region, district, school, created_at`,
      [
        first_name, last_name, phone, hashedPassword,
        birth_date || null, birth_year || null,
        region || null, district || null, village || null, normalizeSchool(school)
      ]
    );

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
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "Telefon va parolni kiriting" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Telefon yoki parol noto'g'ri" });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: "Telefon yoki parol noto'g'ri" });
    }

    res.json({
      message: "Tizimga muvaffaqiyatli kirdingiz!",
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
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
      level: humanPlayer.level || "A1",
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

// ============ LIGA (SERVER) ============
const SERVER_LEAGUES = [
  { name: "Bronze", min: 0, max: 999 },
  { name: "Silver", min: 1000, max: 1199 },
  { name: "Gold", min: 1200, max: 1399 },
  { name: "Platinum", min: 1400, max: 1599 },
  { name: "Diamond", min: 1600, max: 1799 },
  { name: "Master", min: 1800, max: 1999 },
  { name: "Grandmaster", min: 2000, max: Infinity },
];

function getLeagueName(rating) {
  for (const league of SERVER_LEAGUES) {
    if (rating >= league.min && rating <= league.max) return league.name;
  }
  return "Bronze";
}

// ============ MAKTAB NOMINI BIR XIL QILISH (normalizatsiya) ============
function normalizeSchool(school) {
  if (!school) return null;

  // 1. Bosh va oxirgi bo'shliqlarni olib tashlash + kichik harf
  let s = school.trim().toLowerCase();

  if (s === "") return null;

  // 2. Raqam bor-yo'qligini tekshirish (masalan "5", "23")
  const numberMatch = s.match(/\d+/);

  if (numberMatch) {
    // Raqam topildi -> "RAQAM-maktab" formatiga keltirish
    const number = numberMatch[0];
    return number + "-maktab";
  }

  // 3. Raqam yo'q bo'lsa (masalan nom bilan) - faqat ortiqcha bo'shliqlarni tozalash
  s = s.replace(/\s+/g, " "); // ko'p bo'shliqni bitta qilish
  return s;
}

// ============ BILDIRISHNOMA YARATISH ============
async function createNotification(userId, type, message) {
  try {
    await pool.query(
      "INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)",
      [userId, type, message]
    );
  } catch (err) {
    console.error("Bildirishnoma yaratish xatosi:", err.message);
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
const onlineUsers = {}; // { userId: socketId }

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
      level: player1.level || "A1",
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
  // O'yinchi onlayn bo'ldi - ro'yxatga olish
  socket.on("registerUser", (userId) => {
    if (userId) {
      onlineUsers[userId] = socket.id;
      socket.userId = userId;
      console.log("Onlayn:", userId);
    }
  });

  // Do'stga jang chaqiruvi yuborish
  socket.on("challengeFriend", ({ fromUserId, fromName, toUserId, level }) => {
    console.log("Chaqiruv:", fromUserId, "->", toUserId, "| Onlayn:", Object.keys(onlineUsers));
    const targetSocketId = onlineUsers[String(toUserId)];

    if (!targetSocketId) {
      socket.emit("challengeResult", { success: false, message: "Do'stingiz hozir onlayn emas" });
      return;
    }

    io.to(targetSocketId).emit("challengeReceived", {
      fromUserId: fromUserId,
      fromName: fromName,
      fromSocketId: socket.id,
      level: level,
    });

    socket.emit("challengeResult", { success: true, message: "Chaqiruv yuborildi, javob kutilmoqda..." });
  });

  // Chaqiruvga javob (qabul yoki rad)
  socket.on("challengeResponse", ({ accepted, fromSocketId, fromUserId, fromName, myUserId, myName, level }) => {
    const challengerSocket = io.sockets.sockets.get(fromSocketId);

    if (!accepted) {
      if (challengerSocket) {
        challengerSocket.emit("challengeDeclined", { byName: myName });
      }
      return;
    }

    const roomId = "friend_battle_" + fromSocketId + "_" + socket.id;
    if (challengerSocket) challengerSocket.join(roomId);
    socket.join(roomId);

    if (challengerSocket) {
      challengerSocket.emit("matchFound", {
        roomId: roomId,
        opponent: { name: myName },
        message: "Do'stingiz qabul qildi!",
      });
    }
    socket.emit("matchFound", {
      roomId: roomId,
      opponent: { name: fromName },
      message: "Jang boshlanmoqda!",
    });

    const player1 = { socketId: fromSocketId, userId: fromUserId, name: fromName, level: level || "A1" };
    const player2 = { socketId: socket.id, userId: myUserId, name: myName, level: level || "A1" };
    setTimeout(() => startBattle(roomId, player1, player2), 1500);
  });

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
      // Daraja mosligini tekshirish
      const myLevel = playerData.level || "A1";
      if (waitingPlayer.level !== myLevel) {
        // Daraja mos kelmadi — bu o'yinchi ham navbatga turadi (o'z darajasi bilan)
        // Eski kutayotgan o'yinchini saqlab qolamiz, yangisini ham qo'shamiz
        // Sodda yechim: yangi o'yinchini kutishga qo'yamiz (eski o'rniga)
        // Lekin eski o'yinchi ham kerak — shuning uchun massivga o'tamiz
        // Hozircha: agar daraja mos kelmasa, yangi o'yinchi botga o'tadi (10s kutmasdan)
        const botName2 = getRandomBotName();
        const roomIdBot = "battle_bot_" + socket.id;
        socket.join(roomIdBot);
        socket.emit("matchFound", {
          roomId: roomIdBot,
          opponent: { name: botName2 },
          message: "Raqib topildi!",
        });
        const botPlayer = { socketId: socket.id, userId: playerData.userId, name: playerData.name || "O'yinchi", level: myLevel, botName: botName2 };
        setTimeout(() => startBotBattle(roomIdBot, botPlayer), 2000);
        return;
      }

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
    // Onlayn ro'yxatdan o'chirish
    if (socket.userId && onlineUsers[socket.userId] === socket.id) {
      delete onlineUsers[socket.userId];
      console.log("Offlayn:", socket.userId);
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
        // Eski reytingni eslab qolish (liga o'zgarishini tekshirish uchun)
        const oldRatingResult = await pool.query(
          "SELECT rating FROM users WHERE id = $1",
          [me.userId]
        );
        const oldRating = oldRatingResult.rows[0] ? oldRatingResult.rows[0].rating : 1000;

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

          // Liga o'zgardimi?
          const oldLeague = getLeagueName(oldRating);
          const newLeague = getLeagueName(updatedUser.rating);
          if (oldLeague !== newLeague) {
            me.leagueChange = {
              old: oldLeague,
              new: newLeague,
              promoted: updatedUser.rating > oldRating, // ko'tarildimi yoki tushdimi
            };
          }
        }

        // Jang tarixiga yozish
        await pool.query(
          `INSERT INTO battle_history
           (user_id, opponent_name, my_score, opponent_score, outcome, xp_earned, rating_change, cefr_level)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [me.userId, opp.name, me.score, opp.score, outcome, xpEarned, ratingDelta, battle.level || "A1"]
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
      league_change: me.leagueChange || null,
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
              current_streak, longest_streak,
              region, district, village, school, birth_date, phone
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

// ============ DARAJA IMTIHONI ============

// Keyingi daraja (A1 -> A2, A2 -> B1, ...)
const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
function getNextLevel(current) {
  const idx = LEVEL_ORDER.indexOf(current);
  if (idx === -1 || idx === LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
}

// Imtihon ochilish holatini tekshirish
app.get("/exam/status/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    const userResult = await pool.query(
      "SELECT cefr_level FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }

    const currentLevel = userResult.rows[0].cefr_level;
    const nextLevel = getNextLevel(currentLevel);

    // Eng yuqori daraja (C2) - imtihon yo'q
    if (!nextLevel) {
      return res.json({
        eligible: false,
        current_level: currentLevel,
        next_level: null,
        reason: "Siz eng yuqori darajadasiz!",
      });
    }

    // Shu darajadagi janglar statistikasi
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) AS battles,
         COALESCE(SUM(my_score), 0) AS total_correct
       FROM battle_history
       WHERE user_id = $1 AND cefr_level = $2`,
      [userId, currentLevel]
    );

    const battles = parseInt(statsResult.rows[0].battles);
    const totalCorrect = parseInt(statsResult.rows[0].total_correct);
    // Har jangda 5 savol bor edi, shuning uchun jami savollar = battles * 5
    const totalQuestions = battles * 5;
    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    // Shartlar
    const MIN_BATTLES = 10;
    const MIN_ACCURACY = 70;

    const eligible = battles >= MIN_BATTLES && accuracy >= MIN_ACCURACY;

    res.json({
      eligible: eligible,
      current_level: currentLevel,
      next_level: nextLevel,
      progress: {
        battles: battles,
        battles_required: MIN_BATTLES,
        accuracy: accuracy,
        accuracy_required: MIN_ACCURACY,
      },
    });
  } catch (err) {
    console.error("Imtihon status xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Imtihon savollarini olish
app.get("/exam/start/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    const userResult = await pool.query(
      "SELECT cefr_level FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }

    const currentLevel = userResult.rows[0].cefr_level;

    // Shu darajadan 20 ta tasodifiy savol (aralash skill)
    const result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, skill
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT 20`,
      [currentLevel]
    );

    if (result.rows.length < 10) {
      return res.status(400).json({
        error: "Imtihon uchun yetarli savol yo'q (kamida 10 ta kerak)",
      });
    }

    res.json({
      level: currentLevel,
      total: result.rows.length,
      questions: result.rows, // to'g'ri javobsiz
    });
  } catch (err) {
    console.error("Imtihon start xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Imtihon javoblarini tekshirish va baholash
app.post("/exam/submit", async (req, res) => {
  try {
    const { userId, answers } = req.body;
    // answers = [{ question_id, answer }, ...]

    if (!userId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: "Ma'lumot yetishmaydi" });
    }

    const userResult = await pool.query(
      "SELECT cefr_level FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    }
    const currentLevel = userResult.rows[0].cefr_level;
    const nextLevel = getNextLevel(currentLevel);

    // Har javobni tekshirish + skill bo'yicha sanash
    let totalCorrect = 0;
    const skillStats = {}; // { grammar: {correct, total}, ... }

    for (const ans of answers) {
      const q = await pool.query(
        "SELECT correct_option, skill FROM questions WHERE id = $1",
        [ans.question_id]
      );
      if (q.rows.length === 0) continue;

      const skill = q.rows[0].skill || "other";
      if (!skillStats[skill]) skillStats[skill] = { correct: 0, total: 0 };
      skillStats[skill].total++;

      if (q.rows[0].correct_option === ans.answer) {
        totalCorrect++;
        skillStats[skill].correct++;
      }
    }

    const total = answers.length;
    const overallPercent = total > 0 ? Math.round((totalCorrect / total) * 100) : 0;

    // O'tish shartlari
    const PASS_OVERALL = 75; // umumiy 75%
    const PASS_SKILL = 60;   // har skill 60%

    // Har skill bo'yicha foiz
    const skillResults = {};
    let allSkillsPassed = true;
    for (const skill in skillStats) {
      const s = skillStats[skill];
      const percent = Math.round((s.correct / s.total) * 100);
      skillResults[skill] = { correct: s.correct, total: s.total, percent: percent };
      if (percent < PASS_SKILL) allSkillsPassed = false;
    }

    const passed = overallPercent >= PASS_OVERALL && allSkillsPassed;

    // O'tsa - darajani oshirish
    let newLevel = currentLevel;
    if (passed && nextLevel) {
      await pool.query("UPDATE users SET cefr_level = $1 WHERE id = $2", [nextLevel, userId]);
      newLevel = nextLevel;
    }

    // Yangilangan foydalanuvchi
    const updated = await pool.query(
      `SELECT id, first_name, last_name, email, cefr_level, xp, rating, coins,
              current_streak, longest_streak
       FROM users WHERE id = $1`,
      [userId]
    );

    res.json({
      passed: passed,
      overall_percent: overallPercent,
      total_correct: totalCorrect,
      total: total,
      pass_overall_required: PASS_OVERALL,
      pass_skill_required: PASS_SKILL,
      skill_results: skillResults,
      old_level: currentLevel,
      new_level: newLevel,
      level_changed: passed && nextLevel !== null,
      updated_user: updated.rows[0],
    });
  } catch (err) {
    console.error("Imtihon submit xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ MAKTAB / VILOYAT REYTINGI ============

// Maktab reytingi (jami reyting bo'yicha)
app.get("/rankings/schools", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         school,
         region,
         COUNT(*) AS player_count,
         SUM(rating) AS total_rating,
         ROUND(AVG(rating)) AS avg_rating
       FROM users
       WHERE school IS NOT NULL AND school <> ''
       GROUP BY school, region
       ORDER BY total_rating DESC
       LIMIT 50`
    );

    res.json({ schools: result.rows });
  } catch (err) {
    console.error("Maktab reytingi xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Viloyat reytingi
app.get("/rankings/regions", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         region,
         COUNT(*) AS player_count,
         SUM(rating) AS total_rating,
         ROUND(AVG(rating)) AS avg_rating
       FROM users
       WHERE region IS NOT NULL AND region <> ''
       GROUP BY region
       ORDER BY total_rating DESC
       LIMIT 50`
    );

    res.json({ regions: result.rows });
  } catch (err) {
    console.error("Viloyat reytingi xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ DO'STLAR TIZIMI ============

// Foydalanuvchi qidirish (telefon yoki ism bo'yicha)
app.get("/friends/search", async (req, res) => {
  try {
    const { q, userId } = req.query;
    if (!q || q.trim() === "") {
      return res.json({ results: [] });
    }

    const searchTerm = "%" + q.trim() + "%";
    const result = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, phone
       FROM users
       WHERE (first_name ILIKE $1
              OR last_name ILIKE $1
              OR phone ILIKE $1
              OR (first_name || ' ' || last_name) ILIKE $1
              OR (last_name || ' ' || first_name) ILIKE $1)
         AND id != $2
       LIMIT 20`,
      [searchTerm, userId || 0]
    );

    res.json({ results: result.rows });
  } catch (err) {
    console.error("Do'st qidirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Do'st so'rovi yuborish
app.post("/friends/request", async (req, res) => {
  try {
    const { requesterId, receiverId } = req.body;
    if (!requesterId || !receiverId) {
      return res.status(400).json({ error: "Ma'lumot yetishmaydi" });
    }
    if (requesterId === receiverId) {
      return res.status(400).json({ error: "O'zingizga so'rov yubora olmaysiz" });
    }

    // Allaqachon so'rov yoki do'stlik bormi (ikki yo'nalishda ham)
    const existing = await pool.query(
      `SELECT * FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
      [requesterId, receiverId]
    );

    if (existing.rows.length > 0) {
      const f = existing.rows[0];
      if (f.status === "accepted") {
        return res.status(400).json({ error: "Siz allaqachon do'stsiz" });
      }
      return res.status(400).json({ error: "So'rov allaqachon yuborilgan" });
    }

    await pool.query(
      `INSERT INTO friendships (requester_id, receiver_id, status)
       VALUES ($1, $2, 'pending')`,
      [requesterId, receiverId]
    );

    // Qabul qiluvchiga bildirishnoma
    const requesterInfo = await pool.query(
      "SELECT first_name, last_name FROM users WHERE id = $1",
      [requesterId]
    );
    if (requesterInfo.rows.length > 0) {
      const name = requesterInfo.rows[0].first_name + " " + requesterInfo.rows[0].last_name;
      await createNotification(receiverId, "friend_request", name + " sizga do'st so'rovi yubordi");
    }

    res.json({ message: "So'rov yuborildi!" });
  } catch (err) {
    console.error("So'rov yuborish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// So'rovni qabul qilish yoki rad etish
app.post("/friends/respond", async (req, res) => {
  try {
    const { friendshipId, action } = req.body; // action: 'accept' yoki 'reject'
    if (!friendshipId || !action) {
      return res.status(400).json({ error: "Ma'lumot yetishmaydi" });
    }

    const newStatus = action === "accept" ? "accepted" : "rejected";
    await pool.query(
      "UPDATE friendships SET status = $1 WHERE id = $2",
      [newStatus, friendshipId]
    );

    // Qabul qilинganда - so'rov yuborganга bildirishnoma
    if (action === "accept") {
      const friendship = await pool.query(
        "SELECT requester_id, receiver_id FROM friendships WHERE id = $1",
        [friendshipId]
      );
      if (friendship.rows.length > 0) {
        const requesterId = friendship.rows[0].requester_id;
        const receiverId = friendship.rows[0].receiver_id;
        const accepterInfo = await pool.query(
          "SELECT first_name, last_name FROM users WHERE id = $1",
          [receiverId]
        );
        if (accepterInfo.rows.length > 0) {
          const name = accepterInfo.rows[0].first_name + " " + accepterInfo.rows[0].last_name;
          await createNotification(requesterId, "friend_accepted", name + " do'st so'rovingizni qabul qildi");
        }
      }
    }

    res.json({ message: action === "accept" ? "Do'st qo'shildi!" : "So'rov rad etildi" });
  } catch (err) {
    console.error("So'rovga javob xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Kelgan so'rovlar (men qabul qilishim kerak bo'lganlar)
app.get("/friends/requests/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await pool.query(
      `SELECT f.id AS friendship_id, u.id, u.first_name, u.last_name, u.cefr_level, u.rating
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.receiver_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );
    res.json({ requests: result.rows });
  } catch (err) {
    console.error("So'rovlar xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Do'stlar ro'yxati (qabul qilingan)
app.get("/friends/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating
       FROM friendships f
       JOIN users u ON (u.id = f.requester_id OR u.id = f.receiver_id)
       WHERE (f.requester_id = $1 OR f.receiver_id = $1)
         AND f.status = 'accepted'
         AND u.id != $1
       ORDER BY u.rating DESC`,
      [userId]
    );
    res.json({ friends: result.rows });
  } catch (err) {
    console.error("Do'stlar xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ BILDIRISHNOMALAR ============

// Foydalanuvchining bildirishnomalari
app.get("/notifications/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const result = await pool.query(
      `SELECT id, type, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [userId]
    );

    // O'qilmaganlar soni
    const unread = result.rows.filter(n => !n.is_read).length;

    res.json({ notifications: result.rows, unread: unread });
  } catch (err) {
    console.error("Bildirishnoma olish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Hammasini o'qilgan deb belgilash
app.post("/notifications/read/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE",
      [userId]
    );
    res.json({ message: "O'qilgan deb belgilandi" });
  } catch (err) {
    console.error("Bildirishnoma o'qish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// DIQQAT: app.listen emas, server.listen!
server.listen(PORT, () => {
  console.log("Server ishga tushdi: http://localhost:3000");
});