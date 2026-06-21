const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("./db");
const http = require("http");
const { Server } = require("socket.io");

const multer = require("multer");
const path = require("path");
const { signToken, authMiddleware, requireTeacher, requireStudent } = require("./auth");

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


// ============ OTP (TELEFON TASDIQLASH) ============

// Mock SMS yuborish funksiyasi.
// HOZIR: kodni terminalga chiqaradi.
// KEYIN: bu yerga Eskiz yoki Play Mobile SMS kodini qo'shamiz.
async function sendSms(phone, code) {
  console.log("========================================");
  console.log("📱 SMS YUBORILDI (mock rejim)");
  console.log("   Telefon: " + phone);
  console.log("   Kod: " + code);
  console.log("   (5 daqiqa amal qiladi)");
  console.log("========================================");
  // KELAJAKDA: bu yerda real SMS API chaqiriladi. Masalan:
  // await eskizApi.send(phone, "Sizning kodingiz: " + code);
}

// 6 xonali tasodifiy kod yaratish
function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// KOD YUBORISH endpoint
app.post("/otp/send", async (req, res) => {
  try {
    const { phone } = req.body;

    // Telefon tekshiruvi
    if (!phone || phone.trim().length < 9) {
      return res.status(400).json({ error: "To'g'ri telefon raqamini kiriting" });
    }

    // Bu telefon allaqachon ro'yxatdan o'tganmi?
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE phone = $1",
      [phone]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Bu telefon raqami allaqachon ro'yxatdan o'tgan" });
    }

    // 6 xonali kod yaratish
    const code = generateOtpCode();

    // Kodni hashlash (xavfsizlik uchun, parol kabi)
    const hashedCode = await bcrypt.hash(code, 10);

    // Muddati: hozirdan 5 daqiqa keyin
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Eski kodlarni shu telefon uchun o'chiramiz (faqat oxirgisi amal qilsin)
    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);

    // Yangi kodni saqlash
    await pool.query(
      "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)",
      [phone, hashedCode, expiresAt]
    );

    // SMS yuborish (hozir: terminalga)
    await sendSms(phone, code);

    // Javob — kodning O'ZINI yubormaymiz, faqat "yuborildi" deymiz
    res.json({ message: "Tasdiqlash kodi yuborildi" });
  } catch (err) {
    console.error("OTP yuborish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// KOD TEKSHIRISH endpoint (2-bosqich: "Tasdiqlash" bosilganda)
app.post("/otp/verify", async (req, res) => {
  try {
    const { phone, code } = req.body;

    // Ma'lumot tekshiruvi
    if (!phone || !code) {
      return res.status(400).json({ error: "Telefon va kod kiritilishi shart" });
    }

    // Shu telefon uchun eng oxirgi kodni topamiz
    const otpResult = await pool.query(
      "SELECT * FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1",
      [phone]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: "Avval tasdiqlash kodini oling" });
    }

    const otpRecord = otpResult.rows[0];

    // Muddati o'tganmi?
    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ error: "Kod muddati tugagan, yangi kod oling" });
    }

    // Kod to'g'rimi? (hashlangan kod bilan solishtirish)
    const codeValid = await bcrypt.compare(String(code), otpRecord.code);
    if (!codeValid) {
      return res.status(400).json({ error: "Kod noto'g'ri" });
    }

    // To'g'ri! Lekin kodni O'CHIRMAYMIZ — u /register'da yana kerak bo'ladi.
    res.json({ verified: true, message: "Telefon tasdiqlandi" });
  } catch (err) {
    console.error("OTP tekshirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// RO'YXATDAN O'TISH (register)
app.post("/register", async (req, res) => {
  try {
    const {
      first_name, last_name, phone, password,
      birth_date, birth_year, region, district, village, school,
      code, role
    } = req.body;

    // Majburiy maydonlar
    if (!first_name || !last_name || !phone || !password) {
      return res.status(400).json({ error: "Ism, familiya, telefon va parol majburiy" });
    }

    // Rolni tekshirish (faqat ruxsat etilgan rollar)
    const allowedRoles = ["student", "teacher", "parent", "school_admin"];
    const userRole = allowedRoles.includes(role) ? role : "student";

    // Telefon allaqachon ro'yxatdan o'tganmi
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Bu telefon raqami allaqachon ro'yxatdan o'tgan" });
    }
    // ============ OTP TEKSHIRUVI ============
    // Kod yuborilganmi?
    if (!code) {
      return res.status(400).json({ error: "Tasdiqlash kodi kiritilmadi" });
    }

    // Shu telefon uchun eng oxirgi kodni topamiz
    const otpResult = await pool.query(
      "SELECT * FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1",
      [phone]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: "Avval tasdiqlash kodini oling" });
    }

    const otpRecord = otpResult.rows[0];

    // Muddati o'tganmi?
    if (new Date() > new Date(otpRecord.expires_at)) {
      return res.status(400).json({ error: "Kod muddati tugagan, yangi kod oling" });
    }

    // Yuborilgan kod to'g'rimi? (hashlangan kod bilan solishtirish)
    const codeValid = await bcrypt.compare(String(code), otpRecord.code);
    if (!codeValid) {
      return res.status(400).json({ error: "Kod noto'g'ri" });
    }
    // ============ OTP TEKSHIRUVI TUGADI ============

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      `INSERT INTO users
       (first_name, last_name, phone, password, birth_date, birth_year, region, district, village, school, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, first_name, last_name, phone, cefr_level, xp, rating, coins,
                 region, district, school, role, created_at`,
      [
        first_name, last_name, phone, hashedPassword,
        birth_date || null, birth_year || null,
        region || null, district || null, village || null, normalizeSchool(school),
        userRole
      ]
    );

    // Ishlatilgan OTP kodni o'chiramiz
    await pool.query("DELETE FROM otp_codes WHERE phone = $1", [phone]);

    const token = signToken(newUser.rows[0]);

    res.status(201).json({
      message: "Ro'yxatdan o'tish muvaffaqiyatli!",
      token: token,
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

    const token = signToken(user);

    res.json({
      message: "Tizimga muvaffaqiyatli kirdingiz!",
      token: token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        cefr_level: user.cefr_level,
        xp: user.xp,
        rating: user.rating,
        coins: user.coins,
        profile_picture: user.profile_picture,
        role: user.role,
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

// Foydalanuvchi onlayn/offlayn bo'lganda, uning do'stlariga xabar berish
async function notifyFriendsStatus(userId, isOnline) {
  try {
    const result = await pool.query(
      `SELECT requester_id, receiver_id FROM friendships
       WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
      [userId]
    );
    result.rows.forEach(row => {
      const friendId = String(row.requester_id) === String(userId) ? row.receiver_id : row.requester_id;
      const friendSocket = onlineUsers[String(friendId)];
      if (friendSocket) {
        io.to(friendSocket).emit("friendStatusChanged", { userId: String(userId), isOnline: isOnline });
      }
    });
  } catch (err) {
    console.error("notifyFriendsStatus xatosi:", err.message);
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
const pendingBattles = {}; // Do'st janglari: battle.html'da tayyor bo'lishni kutayotgan
const onlineUsers = {}; // { userId: socketId }


// Raqib kartasi uchun: rating + win rate olish (matchmaking overlay'da ko'rsatish uchun)
async function getOpponentCardInfo(userId) {
  if (!userId) return { rating: 1000, win_rate: 0 };
  try {
    const r = await pool.query("SELECT rating FROM users WHERE id = $1", [userId]);
    const rating = r.rows[0] ? r.rows[0].rating : 1000;

    const s = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE outcome = 'win') AS wins
       FROM battle_history WHERE user_id = $1`,
      [userId]
    );
    const total = parseInt(s.rows[0].total) || 0;
    const wins = parseInt(s.rows[0].wins) || 0;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    return { rating: rating, win_rate: winRate };
  } catch (e) {
    return { rating: 1000, win_rate: 0 };
  }
}


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

    // Ikki o'yinchining rasmini bazadan olish
    let pic1 = null, pic2 = null;
    try {
      const picRes = await pool.query("SELECT id, profile_picture FROM users WHERE id = ANY($1)", [[player1.userId, player2.userId]]);
      picRes.rows.forEach(r => {
        if (String(r.id) === String(player1.userId)) pic1 = r.profile_picture;
        if (String(r.id) === String(player2.userId)) pic2 = r.profile_picture;
      });
    } catch (e) {}

    // Har o'yinchiga ALOHIDA yuborish: o'z rasmi + raqib rasmi
    io.to(player1.socketId).emit("battleStart", {
      total_questions: safeQuestions.length,
      questions: safeQuestions,
      myPicture: pic1,
      opponentPicture: pic2,
      opponentName: player2.name,
      opponentId: player2.userId,
      myName: player1.name,
      level: player1.level,
    });
    io.to(player2.socketId).emit("battleStart", {
      total_questions: safeQuestions.length,
      questions: safeQuestions,
      myPicture: pic2,
      opponentPicture: pic1,
      opponentName: player1.name,
      opponentId: player1.userId,
      myName: player2.name,
      level: player2.level,
    });

    console.log("Jang boshlandi, xona:", roomId);
  } catch (err) {
    console.error("Jang boshlashda xato:", err.message);
  }
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // === SINF KUZATUVI (o'qituvchi class detail sahifasini ochganda) ===
  // O'qituvchi sinfni "kuzatishni" boshlaydi — shu sinf room'iga qo'shiladi.
  // Yangi o'quvchi qo'shilganda, faqat shu room'dagilar darhol xabar oladi.
  socket.on("watchClass", (classId) => {
    if (classId == null) return;
    const room = "class_" + String(classId);
    socket.join(room);
  });
  // Sahifadan chiqqanda kuzatishni to'xtatadi
  socket.on("unwatchClass", (classId) => {
    if (classId == null) return;
    const room = "class_" + String(classId);
    socket.leave(room);
  });

  // User online registration
  socket.on("registerUser", async (userId) => {
    if (!userId) {
      socket.emit("errorMessage", {
        message: "User ID is required.",
      });
      return;
    }

    const normalizedUserId = String(userId);

    socket.userId = normalizedUserId;

    // If you only allow one active socket per user:
    onlineUsers[normalizedUserId] = socket.id;

    console.log("User online:", normalizedUserId);

    // Notify user's friends that this user is online
    notifyFriendsStatus(normalizedUserId, true);

    socket.emit("userRegistered", {
      success: true,
      userId: normalizedUserId,
      socketId: socket.id,
    });
  });

  // Friend battle room join
  socket.on("joinFriendBattle", ({ roomId, userId }) => {
    if (!roomId || !userId) {
      socket.emit("battleError", {
        message: "Room ID and User ID are required.",
      });
      return;
    }

    const normalizedUserId = String(userId);
    const pending = pendingBattles[roomId];

    if (!pending) {
      socket.emit("battleError", {
        message: "Battle room not found or already expired.",
      });
      return;
    }

    const isPlayer1 = String(pending.player1.userId) === normalizedUserId;
    const isPlayer2 = String(pending.player2.userId) === normalizedUserId;

    if (!isPlayer1 && !isPlayer2) {
      socket.emit("battleError", {
        message: "You are not allowed to join this battle.",
      });
      return;
    }

    socket.join(roomId);

    if (isPlayer1) {
      pending.player1.ready = true;
      pending.player1.socketId = socket.id;
    }

    if (isPlayer2) {
      pending.player2.ready = true;
      pending.player2.socketId = socket.id;
    }

    console.log(`User ${normalizedUserId} joined friend battle room: ${roomId}`);

    io.to(roomId).emit("battleWaiting", {
      roomId,
      player1Ready: pending.player1.ready,
      player2Ready: pending.player2.ready,
      message: "Waiting for both players to be ready...",
    });

    if (pending.player1.ready && pending.player2.ready) {
      const p1 = {
        socketId: pending.player1.socketId,
        userId: pending.player1.userId,
        name: pending.player1.name,
        level: pending.player1.level,
      };

      const p2 = {
        socketId: pending.player2.socketId,
        userId: pending.player2.userId,
        name: pending.player2.name,
        level: pending.player2.level,
      };

      delete pendingBattles[roomId];

      io.to(roomId).emit("battleStarting", {
        roomId,
        players: [p1, p2],
        countdown: 3,
        message: "Both players are ready. Battle is starting...",
      });

      startBattle(roomId, p1, p2);
    }
  });

  // User disconnect
  socket.on("disconnect", () => {
    const userId = socket.userId;

    if (userId && onlineUsers[userId] === socket.id) {
      delete onlineUsers[userId];

      console.log("User offline:", userId);

      notifyFriendsStatus(userId, false);
    }

    console.log("Socket disconnected:", socket.id);
  });

  // Rematch: bir o'yinchi qayta jang so'raydi
  socket.on("requestRematch", ({ opponentId, myUserId, myName, level }) => {
    const targetSocketId = onlineUsers[String(opponentId)];
    if (!targetSocketId) {
      socket.emit("rematchUnavailable", { message: "Raqib hozir mavjud emas" });
      return;
    }
    io.to(targetSocketId).emit("rematchRequested", {
      fromUserId: myUserId,
      fromName: myName,
      fromSocketId: socket.id,
      level: level || "A1",
    });
  });

  // Rematch javobi
  socket.on("rematchResponse", async ({ accepted, fromSocketId, fromUserId, fromName, myUserId, myName, level }) => {
    const requesterSocket = io.sockets.sockets.get(fromSocketId);
    if (!accepted) {
      if (requesterSocket) requesterSocket.emit("rematchDeclined", { byName: myName });
      return;
    }
    const roomId = "friend_battle_" + fromSocketId + "_" + socket.id;
    if (requesterSocket) requesterSocket.join(roomId);
    socket.join(roomId);

    let fromPic = null, myPic = null;
    try {
      const picRes = await pool.query("SELECT id, profile_picture FROM users WHERE id = ANY($1)", [[fromUserId, myUserId]]);
      picRes.rows.forEach(r => {
        if (String(r.id) === String(fromUserId)) fromPic = r.profile_picture;
        if (String(r.id) === String(myUserId)) myPic = r.profile_picture;
      });
    } catch (e) {}

    if (requesterSocket) {
      requesterSocket.emit("matchFound", { roomId, opponent: { name: myName, profile_picture: myPic }, message: "Rematch qabul qilindi!" });
    }
    socket.emit("matchFound", { roomId, opponent: { name: fromName, profile_picture: fromPic }, message: "Rematch boshlanmoqda!" });

    const player1 = { socketId: fromSocketId, userId: fromUserId, name: fromName, level: level || "A1" };
    const player2 = { socketId: socket.id, userId: myUserId, name: myName, level: level || "A1" };
    setTimeout(() => startBattle(roomId, player1, player2), 1500);
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
  socket.on("challengeResponse", async ({ accepted, fromSocketId, fromUserId, fromName, myUserId, myName, level }) => {
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

    // Raqiblarning rasmlarini bazadan olish
    let fromPic = null, myPic = null;
    try {
      const picRes = await pool.query("SELECT id, profile_picture FROM users WHERE id = ANY($1)", [[fromUserId, myUserId]]);
      picRes.rows.forEach(r => {
        if (String(r.id) === String(fromUserId)) fromPic = r.profile_picture;
        if (String(r.id) === String(myUserId)) myPic = r.profile_picture;
      });
    } catch (e) {}

    if (challengerSocket) {
      challengerSocket.emit("matchFound", {
        roomId: roomId,
        opponent: { name: myName, profile_picture: myPic },
        message: "Do'stingiz qabul qildi!",
      });
    }
    socket.emit("matchFound", {
      roomId: roomId,
      opponent: { name: fromName, profile_picture: fromPic },
      message: "Jang boshlanmoqda!",
    });

    const player1 = { socketId: fromSocketId, userId: fromUserId, name: fromName, level: level || "A1" };
    const player2 = { socketId: socket.id, userId: myUserId, name: myName, level: level || "A1" };

    // Do'st jangi: darrov boshlamaymiz. Ikki o'yinchi battle.html'ga o'tib "tayyorman" deganda boshlanadi.
    pendingBattles[roomId] = {
      player1: { userId: fromUserId, name: fromName, level: level || "A1", ready: false, socketId: null },
      player2: { userId: myUserId, name: myName, level: level || "A1", ready: false, socketId: null },
    };
  });

  console.log("Yangi o'yinchi ulandi:", socket.id);

  // Do'st jangi: battle.html ochilganda yangi socket room'ga qo'shiladi
  socket.on("joinFriendBattle", ({ roomId, userId, name }) => {
    socket.join(roomId);
    // Agar bu room uchun jang holati bor bo'lsa, socket'ni yangilash
    const battle = battles[roomId];
    if (battle) {
      // Eski socketId'ni topib, yangisiga almashtirish (userId bo'yicha)
      for (const oldSocketId in battle.players) {
        if (String(battle.players[oldSocketId].userId) === String(userId)) {
          if (oldSocketId !== socket.id) {
            battle.players[socket.id] = battle.players[oldSocketId];
            delete battle.players[oldSocketId];
          }
          break;
        }
      }
    }
  });

  // Do'st jangi: battle.html ochilganda o'yinchi "tayyorman" deydi
  socket.on("joinFriendBattle", ({ roomId, userId }) => {
    socket.join(roomId);
    const pending = pendingBattles[roomId];
    if (!pending) return;

    // Qaysi o'yinchi ekanini topib, tayyor + yangi socketId belgilash
    if (String(pending.player1.userId) === String(userId)) {
      pending.player1.ready = true;
      pending.player1.socketId = socket.id;
    } else if (String(pending.player2.userId) === String(userId)) {
      pending.player2.ready = true;
      pending.player2.socketId = socket.id;
    }

    // Ikkalasi ham tayyor bo'lsa - jangni boshlaymiz (yangi socketlar bilan)
    if (pending.player1.ready && pending.player2.ready) {
      const p1 = { socketId: pending.player1.socketId, userId: pending.player1.userId, name: pending.player1.name, level: pending.player1.level };
      const p2 = { socketId: pending.player2.socketId, userId: pending.player2.userId, name: pending.player2.name, level: pending.player2.level };
      delete pendingBattles[roomId];
      startBattle(roomId, p1, p2);
    }
  });

  socket.on("findMatch", async (playerData) => {
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

          // O'yinchiga "raqib topildi" (aslida bot — botга taxminiy karta)
          io.to(player.socketId).emit("matchFound", {
            roomId: roomId,
            opponent: { name: player.botName, rating: player.rating || 1000, win_rate: 50 + Math.floor(Math.random() * 20), level: player.level },
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
          opponent: { name: botName2, rating: playerData.rating || 1000, win_rate: 50 + Math.floor(Math.random() * 20), level: myLevel },
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

      // Ikki o'yinchi rasmini bazadan olish
      let p1Pic = null, p2Pic = null;
      try {
        const picRes = await pool.query("SELECT id, profile_picture FROM users WHERE id = ANY($1)", [[player1.userId, player2.userId]]);
        picRes.rows.forEach(r => {
          if (String(r.id) === String(player1.userId)) p1Pic = r.profile_picture;
          if (String(r.id) === String(player2.userId)) p2Pic = r.profile_picture;
        });
      } catch (e) {}

      // Raqib kartasi uchun rating + win rate
      const p1Card = await getOpponentCardInfo(player1.userId);
      const p2Card = await getOpponentCardInfo(player2.userId);

      // player1'ga player2 raqib sifatida ko'rinadi
      io.to(opponent.socketId).emit("matchFound", {
        roomId,
        opponent: { name: player2.name, profile_picture: p2Pic, rating: p2Card.rating, win_rate: p2Card.win_rate, level: player2.level },
        message: "Raqib topildi!",
      });
      // player2 (socket)'ga player1 raqib sifatida ko'rinadi
      socket.emit("matchFound", {
        roomId,
        opponent: { name: player1.name, profile_picture: p1Pic, rating: p1Card.rating, win_rate: p1Card.win_rate, level: player1.level },
        message: "Raqib topildi!",
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
      notifyFriendsStatus(socket.userId, false); // do'stlarga "men offlayn" signali
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
           (user_id, opponent_name, opponent_id, my_score, opponent_score, outcome, xp_earned, rating_change, cefr_level)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [me.userId, opp.name, opp.userId || null, me.score, opp.score, outcome, xpEarned, ratingDelta, battle.level || "A1"]
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

app.get("/leaderboard", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.xp, u.profile_picture,
         COUNT(bh.id) FILTER (WHERE bh.outcome = 'win') AS wins,
         COUNT(bh.id) AS total_battles
       FROM users u
       LEFT JOIN battle_history bh ON bh.user_id = u.id
       GROUP BY u.id
       ORDER BY u.rating DESC, u.xp DESC
       LIMIT 50`
    );

    // Win rate hisoblash
    const players = result.rows.map(p => {
      const total = parseInt(p.total_battles);
      const wins = parseInt(p.wins);
      return {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        cefr_level: p.cefr_level,
        rating: p.rating,
        xp: p.xp,
        profile_picture: p.profile_picture,
        wins: wins,
        win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
      };
    });

    res.json({ players: players });
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
app.get("/history/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT bh.opponent_name, bh.my_score, bh.opponent_score, bh.outcome,
              bh.xp_earned, bh.rating_change, bh.played_at, bh.cefr_level,
              bh.opponent_id,
              opp.profile_picture AS opponent_picture,
              opp.rating AS opponent_rating
       FROM battle_history bh
       LEFT JOIN users opp ON opp.id = bh.opponent_id
       WHERE bh.user_id = $1
       ORDER BY bh.played_at DESC
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
app.post("/streak/checkin", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

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
app.post("/quests", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const quests = await getOrCreateDailyQuests(userId);
    res.json({ quests: quests });
  } catch (err) {
    console.error("Quests xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Mukofotni olish (bajarilgan topshiriq uchun)
app.post("/quests/claim", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { userQuestId } = req.body;
    if (!userQuestId) return res.status(400).json({ error: "userQuestId kerak" });

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
app.get("/profile/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Asosiy foydalanuvchi ma'lumoti
    const userResult = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, xp, coins,
              current_streak, longest_streak,
              region, district, village, school, birth_date, phone, profile_picture
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
app.get("/exam/status/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

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
app.get("/exam/start/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

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
app.post("/exam/submit", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { answers } = req.body;
    // answers = [{ question_id, answer }, ...]

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: "Javoblar yuborilmadi" });
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

// Tumanlar reytingi
app.get("/rankings/districts", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT district, region,
              COUNT(*) as player_count,
              SUM(rating) as total_rating,
              ROUND(AVG(rating)) as avg_rating
       FROM users
       WHERE district IS NOT NULL AND district != ''
       GROUP BY district, region
       ORDER BY total_rating DESC`
    );
    res.json({ districts: result.rows });
  } catch (err) {
    console.error("Tuman reyting xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ DO'STLAR TIZIMI ============

// Foydalanuvchi qidirish (telefon yoki ism bo'yicha)
app.get("/friends/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;
    if (!q || q.trim() === "") {
      return res.json({ results: [] });
    }

    const searchTerm = "%" + q.trim() + "%";
    const result = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, phone, profile_picture
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

    // Har bir natija uchun do'stlik holatini aniqlash
    const myId = userId || 0;
    const enriched = [];
    for (const u of result.rows) {
      const rel = await pool.query(
        `SELECT status FROM friendships
         WHERE (requester_id = $1 AND receiver_id = $2)
            OR (requester_id = $2 AND receiver_id = $1)`,
        [myId, u.id]
      );
      let friendStatus = "none"; // none, pending, friend
      if (rel.rows.length > 0) {
        friendStatus = rel.rows[0].status === "accepted" ? "friend" : "pending";
      }
      enriched.push({ ...u, friendStatus: friendStatus });
    }

    res.json({ results: enriched });
  } catch (err) {
    console.error("Do'st qidirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Tavsiya etilgan do'stlar (maktab + tuman + region + daraja bo'yicha ballash)
app.get("/friends/suggested/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Joriy foydalanuvchi ma'lumoti
    const meRes = await pool.query(
      "SELECT region, district, school, cefr_level, rating FROM users WHERE id = $1",
      [userId]
    );
    if (meRes.rows.length === 0) return res.status(404).json({ error: "Topilmadi" });
    const me = meRes.rows[0];

    // Allaqachon do'st yoki so'rov bo'lganlarning id'lari
    const relRes = await pool.query(
      `SELECT requester_id, receiver_id FROM friendships
       WHERE requester_id = $1 OR receiver_id = $1`,
      [userId]
    );
    const excludeIds = new Set([parseInt(userId)]);
    relRes.rows.forEach(r => {
      excludeIds.add(r.requester_id);
      excludeIds.add(r.receiver_id);
    });

    // Boshqa foydalanuvchilar (o'zi va do'stlardan tashqari)
    const usersRes = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, region, district, school
       FROM users WHERE id != $1`,
      [userId]
    );

    // Ballash
    const scored = [];
    usersRes.rows.forEach(u => {
      if (excludeIds.has(u.id)) return; // do'st/so'rov borlarni o'tkazib yuborish

      let score = 0;
      const reasons = [];

      // Bir xil maktab + tuman (haqiqiy maktabdosh)
      if (u.school && me.school && u.district && me.district &&
          u.school === me.school && u.district === me.district) {
        score += 100;
        reasons.push("Maktabdosh");
      } else if (u.district && me.district && u.district === me.district) {
        // Bir xil tuman (boshqa maktab)
        score += 50;
        reasons.push("Bir tumandan");
      } else if (u.region && me.region && u.region === me.region) {
        // Bir xil region
        score += 20;
        reasons.push("Bir viloyatdan");
      }

      // Bir xil daraja
      if (u.cefr_level === me.cefr_level) {
        score += 30;
        reasons.push(u.cefr_level + " daraja");
      }

      // Yaqin reyting (±200)
      if (Math.abs((u.rating || 1000) - (me.rating || 1000)) <= 200) {
        score += 15;
      }

      if (score > 0) {
        scored.push({
          id: u.id, first_name: u.first_name, last_name: u.last_name,
          cefr_level: u.cefr_level, rating: u.rating,
          score: score, reason: reasons[0] || "Tavsiya",
        });
      }
    });

    // Ball bo'yicha tartiblash, top 6
    scored.sort((a, b) => b.score - a.score);
    res.json({ suggested: scored.slice(0, 6) });
  } catch (err) {
    console.error("Suggested xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Do'st so'rovi yuborish
app.post("/friends/request", authMiddleware, async (req, res) => {
  try {
    const requesterId = req.user.id;
    const { receiverId } = req.body;
    console.log("So'rov keldi:", requesterId, "->", receiverId);
    if (!receiverId) {
      return res.status(400).json({ error: "receiverId kerak" });
    }
    if (String(requesterId) === String(receiverId)) {
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

    // Qabul qiluvchiga bildirishnoma + real-time signal
    const requesterInfo = await pool.query(
      "SELECT first_name, last_name FROM users WHERE id = $1",
      [requesterId]
    );
    if (requesterInfo.rows.length > 0) {
      const name = requesterInfo.rows[0].first_name + " " + requesterInfo.rows[0].last_name;
      await createNotification(receiverId, "friend_request", name + " sizga do'st so'rovi yubordi");

      // Real-time signal (agar qabul qiluvchi onlayn bo'lsa)
      const targetSocketId = onlineUsers[String(receiverId)];
      console.log("So'rov signal:", receiverId, "-> socket:", targetSocketId, "| Onlayn:", Object.keys(onlineUsers));
      if (targetSocketId) {
        io.to(targetSocketId).emit("newFriendRequest", { fromName: name });
        console.log("Signal yuborildi!");
      } else {
        console.log("Qabul qiluvchi onlayn emas!");
      }
    }

    res.json({ message: "So'rov yuborildi!" });

  } catch (err) {
    console.error("So'rov yuborish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// So'rovni qabul qilish yoki rad etish
app.post("/friends/respond", authMiddleware, async (req, res) => {
  try {
    const myId = req.user.id;
    const { friendshipId, action } = req.body; // action: 'accept' yoki 'reject'
    if (!friendshipId || !action) {
      return res.status(400).json({ error: "Ma'lumot yetishmaydi" });
    }

    // So'rovning kimdan-kimga ekanini topamiz
    const fsInfo = await pool.query(
      "SELECT requester_id, receiver_id FROM friendships WHERE id = $1",
      [friendshipId]
    );
    if (fsInfo.rows.length === 0) {
      return res.status(404).json({ error: "So'rov topilmadi" });
    }
    const requesterId = fsInfo.rows[0].requester_id;
    const receiverId = fsInfo.rows[0].receiver_id;

    // XAVFSIZLIK: faqat O'ZIMGA kelgan so'rovga javob bera olaman
    if (String(receiverId) !== String(myId)) {
      return res.status(403).json({ error: "Bu so'rov sizga tegishli emas" });
    }

    if (action === "accept") {
      // Qabul - do'st bo'lishadi
      await pool.query(
        "UPDATE friendships SET status = 'accepted' WHERE id = $1",
        [friendshipId]
      );

      // So'rov yuborganga bildirishnoma
      const accepterInfo = await pool.query(
        "SELECT first_name, last_name FROM users WHERE id = $1",
        [receiverId]
      );
      if (accepterInfo.rows.length > 0) {
        const name = accepterInfo.rows[0].first_name + " " + accepterInfo.rows[0].last_name;
        await createNotification(requesterId, "friend_accepted", name + " do'st so'rovingizni qabul qildi");
      }
    } else {
      // Rad - yozuvni o'chirish (keyin yana so'rov yuborsa bo'lsin)
      await pool.query("DELETE FROM friendships WHERE id = $1", [friendshipId]);
    }

    // So'rov yuboruvchiga real-time signal (tugmasi o'zgarsin)
    const requesterSocket = onlineUsers[String(requesterId)];
    if (requesterSocket) {
      const responderInfo = await pool.query(
        "SELECT first_name, last_name FROM users WHERE id = $1",
        [receiverId]
      );
      const responderName = responderInfo.rows.length > 0
        ? responderInfo.rows[0].first_name + " " + responderInfo.rows[0].last_name : "Foydalanuvchi";
      io.to(requesterSocket).emit("requestResponded", {
        action: action,
        byUserId: receiverId,
        byName: responderName,
      });
    }

    res.json({ message: action === "accept" ? "Do'st qo'shildi!" : "So'rov rad etildi" });
  } catch (err) {
    console.error("So'rovga javob xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Do'stni o'chirish
app.post("/friends/remove", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendId } = req.body;
    if (!friendId) return res.status(400).json({ error: "friendId kerak" });

    // Ikki yo'nalishdagi do'stlikni o'chirish (kim so'rasa ham)
    await pool.query(
      `DELETE FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
      [userId, friendId]
    );

    // O'chirilgan do'stga (B) real-time signal (uning ro'yxatidan ham o'chsin)
    const friendSocket = onlineUsers[String(friendId)];
    if (friendSocket) {
      io.to(friendSocket).emit("friendRemoved", { byUserId: userId });
    }

    res.json({ message: "Do'st o'chirildi" });
  } catch (err) {
    console.error("Do'st o'chirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Kelgan so'rovlar (men qabul qilishim kerak bo'lganlar)
app.get("/friends/requests/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT f.id AS friendship_id, u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture
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
app.get("/friends/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture
       FROM friendships f
       JOIN users u ON (u.id = f.requester_id OR u.id = f.receiver_id)
       WHERE (f.requester_id = $1 OR f.receiver_id = $1)
         AND f.status = 'accepted'
         AND u.id != $1
       ORDER BY u.rating DESC`,
      [userId]
    );
    // Har bir do'st onlayn yoki yo'qligini belgilash
    const friendsWithStatus = result.rows.map(f => ({
      ...f,
      isOnline: !!onlineUsers[String(f.id)],
    }));

    res.json({ friends: friendsWithStatus });
  } catch (err) {
    console.error("Do'stlar xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Do'stlarga qarshi g'alabalar soni
app.get("/friends/wins/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Do'st id'larini olish
    const friendsRes = await pool.query(
      `SELECT requester_id, receiver_id FROM friendships
       WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
      [userId]
    );
    const friendIds = friendsRes.rows.map(r =>
      String(r.requester_id) === String(userId) ? r.receiver_id : r.requester_id
    );

    if (friendIds.length === 0) {
      return res.json({ wins: 0, total: 0 });
    }

    // Do'stlarga qarshi janglar (opponent_id do'stlardan biri bo'lsa)
    const winsRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
         COUNT(*) AS total
       FROM battle_history
       WHERE user_id = $1 AND opponent_id = ANY($2)`,
      [userId, friendIds]
    );

    res.json({
      wins: parseInt(winsRes.rows[0].wins) || 0,
      total: parseInt(winsRes.rows[0].total) || 0,
    });
  } catch (err) {
    console.error("Wins vs friends xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Do'stlar faoliyati (Recent Activity)
app.get("/friends/activity/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Do'st id'larini olish
    const friendsRes = await pool.query(
      `SELECT requester_id, receiver_id FROM friendships
       WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
      [userId]
    );
    const friendIds = friendsRes.rows.map(r =>
      String(r.requester_id) === String(userId) ? r.receiver_id : r.requester_id
    );

    if (friendIds.length === 0) {
      return res.json({ activities: [] });
    }

    // Do'stlarning so'nggi janglari (har do'stning oxirgi 5 jangi)
    const battlesRes = await pool.query(
      `SELECT bh.user_id, bh.opponent_name, bh.my_score, bh.opponent_score,
              bh.outcome, bh.rating_change, bh.played_at,
              u.first_name, u.last_name, u.rating, u.profile_picture
       FROM battle_history bh
       JOIN users u ON u.id = bh.user_id
       WHERE bh.user_id = ANY($1)
       ORDER BY bh.played_at DESC
       LIMIT 10`,
      [friendIds]
    );

    const activities = battlesRes.rows.map(b => ({
      type: "battle",
      friendId: b.user_id,
      friendName: b.first_name + " " + b.last_name,
      friendFirst: b.first_name,
      friendPic: b.profile_picture,
      outcome: b.outcome,
      myScore: b.my_score,
      oppScore: b.opponent_score,
      opponentName: b.opponent_name,
      ratingChange: b.rating_change,
      rating: b.rating,
      time: b.played_at,
    }));

    res.json({ activities: activities });
  } catch (err) {
    console.error("Faoliyat xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ BILDIRISHNOMALAR ============

// Foydalanuvchining bildirishnomalari
app.get("/notifications/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
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
app.post("/notifications/read/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
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

// ===== PROFIL RASM YUKLASH =====
const uploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "public/uploads"));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, "user_" + req.params.userId + "_" + Date.now() + ext);
  },
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Faqat rasm fayllari!"));
  },
});

// Profil rasm yuklash endpoint
app.post("/profile/:userId/picture", authMiddleware, upload.single("picture"), async (req, res) => {
  try {
    const userId = req.user.id;
    if (!req.file) return res.status(400).json({ error: "Rasm yuklanmadi" });

    const filePath = "/uploads/" + req.file.filename;

    await pool.query(
      "UPDATE users SET profile_picture = $1 WHERE id = $2",
      [filePath, userId]
    );

    res.json({ message: "Rasm yangilandi", profile_picture: filePath });
  } catch (err) {
    console.error("Rasm yuklash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});


// ============================================================
// O'QITUVCHI PANELI (TEACHER) ENDPOINTLARI
// Barcha teacher endpointlari: authMiddleware + requireTeacher
// (avval token tekshiriladi, keyin rol bazadan tekshiriladi)
// ============================================================

// Dashboard asosiy ma'lumotlari (Phase 1 — hozircha bo'sh/boshlang'ich holat)
app.get("/teacher/dashboard", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;

    // O'qituvchi ma'lumotlari
    const teacher = await pool.query(
      "SELECT id, first_name, last_name, school, profile_picture FROM users WHERE id = $1",
      [teacherId]
    );

    // Sinflar soni (haqiqiy — classes jadvalidan)
    const classCount = await pool.query(
      "SELECT COUNT(*) AS count FROM classes WHERE teacher_id = $1 AND archived_at IS NULL",
      [teacherId]
    );

    // O'quvchilar soni (haqiqiy — shu o'qituvchining sinflaridagi faol o'quvchilar, takrorlanmas)
    const studentCount = await pool.query(
      `SELECT COUNT(DISTINCT cs.student_id) AS count
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       WHERE c.teacher_id = $1 AND c.archived_at IS NULL AND cs.status = 'active'`,
      [teacherId]
    );

    // Phase 2: topshiriqlar jadvali hali yo'q, shuning uchun 0.
    const stats = {
      totalClasses: parseInt(classCount.rows[0].count, 10),
      totalStudents: parseInt(studentCount.rows[0].count, 10),
      activeAssignments: 0,
      averagePerformance: 0
    };

    res.json({
      teacher: teacher.rows[0] || null,
      stats: stats
    });
  } catch (err) {
    console.error("Teacher dashboard xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============================================================
// SINF BOSHQARUVI (Teacher Panel Phase 2B)
// ============================================================

// join_code generator: 6 belgili (katta harf + raqam), unique
// Adashtiruvchi belgilar (0/O, 1/I) chiqarib tashlangan — o'qish oson bo'lsin.
function generateClassCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Unique join_code yaratish (bazada bormi tekshiradi, yo'q topilguncha urinadi)
async function generateUniqueClassCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateClassCode();
    const existing = await pool.query("SELECT id FROM classes WHERE join_code = $1", [code]);
    if (existing.rows.length === 0) {
      return code;
    }
  }
  // Juda kam ehtimol — 10 urinishda ham topilmasa, xato
  throw new Error("Join code yaratib bo'lmadi, qayta urinib ko'ring");
}

// YANGI SINF YARATISH
app.post("/teacher/classes", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { name, description } = req.body;

    // name majburiy
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Sinf nomi majburiy" });
    }
    if (name.trim().length > 120) {
      return res.status(400).json({ error: "Sinf nomi juda uzun (120 belgidan oshmasin)" });
    }

    // school_id — o'qituvchining maktabidan (hozircha matn, FK yo'q, shuning uchun null)
    // Maktab tizimi qurilganda bu yerda haqiqiy school_id qo'yiladi.
    const schoolId = null;

    // Unique join_code yaratamiz
    const joinCode = await generateUniqueClassCode();

    const newClass = await pool.query(
      `INSERT INTO classes (teacher_id, school_id, name, description, join_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, teacher_id, school_id, name, description, join_code, created_at, archived_at`,
      [teacherId, schoolId, name.trim(), (description || "").trim() || null, joinCode]
    );

    res.status(201).json({
      message: "Sinf yaratildi",
      class: newClass.rows[0]
    });
  } catch (err) {
    console.error("Sinf yaratish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'QITUVCHINING SINFLARI RO'YXATI
app.get("/teacher/classes", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Faqat shu o'qituvchining arxivlanmagan sinflari
    // (xavfsizlik: boshqa o'qituvchining sinflarini ko'ra olmaydi)
    const classes = await pool.query(
      `SELECT c.id, c.name, c.description, c.join_code, c.created_at,
              COUNT(cs.id) FILTER (WHERE cs.status = 'active') AS student_count
       FROM classes c
       LEFT JOIN class_students cs ON cs.class_id = c.id
       WHERE c.teacher_id = $1 AND c.archived_at IS NULL
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [teacherId]
    );

    res.json({ classes: classes.rows });
  } catch (err) {
    console.error("Sinflar ro'yxati xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'QUVCHI SINFGA QO'SHILADI (join_code orqali)
app.post("/student/join-class", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;
    let { join_code } = req.body;

    // Kod tekshiruvi
    if (!join_code || typeof join_code !== "string") {
      return res.status(400).json({ error: "Qo'shilish kodini kiriting" });
    }
    join_code = join_code.trim().toUpperCase();
    if (join_code.length !== 6) {
      return res.status(400).json({ error: "Kod 6 belgidan iborat bo'lishi kerak" });
    }

    // Sinfni topamiz (arxivlanmagan)
    const classResult = await pool.query(
      "SELECT id, name, teacher_id, archived_at FROM classes WHERE join_code = $1",
      [join_code]
    );
    if (classResult.rows.length === 0) {
      return res.status(404).json({ error: "Bunday kodli sinf topilmadi" });
    }
    const cls = classResult.rows[0];
    if (cls.archived_at !== null) {
      return res.status(400).json({ error: "Bu sinf endi faol emas" });
    }

    // Allaqachon a'zomi tekshiramiz
    const existing = await pool.query(
      "SELECT id, status FROM class_students WHERE class_id = $1 AND student_id = $2",
      [cls.id, studentId]
    );
    if (existing.rows.length > 0) {
      // Agar avval chiqib ketgan bo'lsa (removed/left) — qayta faollashtirish
      if (existing.rows[0].status !== "active") {
        await pool.query(
          "UPDATE class_students SET status = 'active', joined_at = NOW() WHERE id = $1",
          [existing.rows[0].id]
        );
        // Real-time: qayta qo'shilish ham o'qituvchiga ko'rinadi
        io.to("class_" + String(cls.id)).emit("classStudentJoined", { classId: cls.id });
        return res.json({ message: "Sinfga qayta qo'shildingiz", class: { id: cls.id, name: cls.name } });
      }
      return res.status(409).json({ error: "Siz allaqachon bu sinf a'zosisiz" });
    }

    // Qo'shamiz
    await pool.query(
      "INSERT INTO class_students (class_id, student_id, status) VALUES ($1, $2, 'active')",
      [cls.id, studentId]
    );

    // Real-time: shu sinfni kuzatayotgan o'qituvchiga darhol xabar
    io.to("class_" + String(cls.id)).emit("classStudentJoined", { classId: cls.id });

    res.status(201).json({
      message: "Sinfga muvaffaqiyatli qo'shildingiz",
      class: { id: cls.id, name: cls.name }
    });
  } catch (err) {
    console.error("Sinfga qo'shilish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'QUVCHINING SINFLARI RO'YXATI (o'quvchi o'zi ko'radi)
app.get("/student/classes", authMiddleware, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.id;

    // Faqat shu o'quvchi a'zo bo'lgan faol sinflar.
    // O'qituvchi nomi ham qo'shiladi (classes.teacher_id -> users).
    const classes = await pool.query(
      `SELECT c.id, c.name, c.description, c.join_code,
              cs.joined_at, cs.status,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users t ON t.id = c.teacher_id
       WHERE cs.student_id = $1 AND cs.status = 'active' AND c.archived_at IS NULL
       ORDER BY cs.joined_at DESC`,
      [studentId]
    );

    res.json({ classes: classes.rows });
  } catch (err) {
    console.error("O'quvchi sinflari xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// SINF O'QUVCHILARI RO'YXATI (o'qituvchi ko'radi)
app.get("/teacher/classes/:classId/students", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const classId = parseInt(req.params.classId, 10);

    if (isNaN(classId)) {
      return res.status(400).json({ error: "Noto'g'ri sinf ID" });
    }

    // XAVFSIZLIK: sinf shu o'qituvchiniki ekanini tekshiramiz
    const classCheck = await pool.query(
      "SELECT id, name, description, join_code, created_at FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, teacherId]
    );
    if (classCheck.rows.length === 0) {
      // Sinf yo'q yoki boshqa o'qituvchiniki — har holda rad etamiz
      return res.status(404).json({ error: "Sinf topilmadi" });
    }

    // O'quvchilar ro'yxati (faol)
    const students = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture,
              cs.joined_at, cs.status
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
       WHERE cs.class_id = $1 AND cs.status = 'active'
       ORDER BY cs.joined_at DESC`,
      [classId]
    );

    res.json({
      class: classCheck.rows[0],
      students: students.rows
    });
  } catch (err) {
    console.error("Sinf o'quvchilari xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'QUVCHINI SINFDAN OLIB TASHLASH (yumshoq: status='removed')
app.delete("/teacher/classes/:classId/students/:studentId", authMiddleware, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const classId = parseInt(req.params.classId, 10);
    const studentId = parseInt(req.params.studentId, 10);

    if (isNaN(classId) || isNaN(studentId)) {
      return res.status(400).json({ error: "Noto'g'ri ID" });
    }

    // XAVFSIZLIK: sinf shu o'qituvchiniki ekanini tekshiramiz
    const classCheck = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, teacherId]
    );
    if (classCheck.rows.length === 0) {
      // Sinf yo'q yoki boshqa o'qituvchiniki
      return res.status(404).json({ error: "Sinf topilmadi" });
    }

    // O'quvchi shu sinfda faolmi tekshiramiz
    const membership = await pool.query(
      "SELECT id FROM class_students WHERE class_id = $1 AND student_id = $2 AND status = 'active'",
      [classId, studentId]
    );
    if (membership.rows.length === 0) {
      return res.status(404).json({ error: "O'quvchi bu sinfda topilmadi" });
    }

    // Yumshoq o'chirish: status='removed' (yozuv saqlanadi, tarix yo'qolmaydi)
    await pool.query(
      "UPDATE class_students SET status = 'removed' WHERE class_id = $1 AND student_id = $2",
      [classId, studentId]
    );

    res.json({ message: "O'quvchi sinfdan olib tashlandi" });
  } catch (err) {
    console.error("O'quvchini olib tashlash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// DIQQAT: app.listen emas, server.listen!
server.listen(PORT, () => {
  console.log("Server ishga tushdi: http://localhost:3000");
});