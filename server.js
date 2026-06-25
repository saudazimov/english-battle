const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("./db");
const http = require("http");
const { Server } = require("socket.io");

const multer = require("multer");
const path = require("path");
const { signToken, authMiddleware, requireTeacher, requireStudent, signAdminToken, requireAdmin } = require("./auth");
const { validateRegionDistrict } = require("./regions");

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

    // Viloyat-tuman juftligini tekshiramiz (frontendga ishonmaymiz — anti-abuse)
    const regionCheck = validateRegionDistrict(region, district);
    if (!regionCheck.valid) {
      return res.status(400).json({ error: regionCheck.error });
    }

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

    // Bloklangan foydalanuvchi kira olmaydi (admin tomonidan ban qilingan)
    if (user.is_banned) {
      return res.status(403).json({ error: "Hisobingiz bloklangan. Administrator bilan bog'laning." });
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

// ============ BATTLE FORMATLARI (savol soni / vaqt / XP) ============
const BATTLE_LENGTHS = {
  quick:    { label: "Quick",    questions: 10, secondsPerQuestion: 15, totalSeconds: 150, xp: 4 },
  standard: { label: "Standard", questions: 20, secondsPerQuestion: 15, totalSeconds: 300, xp: 8 },
  extended: { label: "Extended", questions: 30, secondsPerQuestion: 15, totalSeconds: 450, xp: 12 },
  marathon: { label: "Marathon", questions: 40, secondsPerQuestion: 15, totalSeconds: 600, xp: 16 },
};
// Format kalitidan savol sonini olamiz (noto'g'ri bo'lsa — standard)
function lengthConfig(key) {
  return BATTLE_LENGTHS[key] || BATTLE_LENGTHS.standard;
}

// Bot bilan jang boshlash
async function startBotBattle(roomId, humanPlayer) {
  try {
    // Tanlangan format bo'yicha savol soni (yo'q bo'lsa — standard)
    const cfg = lengthConfig(humanPlayer.lengthKey);
    const qCount = cfg.questions;

    let result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2`,
      [humanPlayer.level, qCount]
    );

    // Zaxira: o'yinchi darajasi uchun savol bo'lmasa, har qanday darajadan olamiz
    if (result.rows.length === 0) {
      console.log("'" + humanPlayer.level + "' uchun savol yo'q — zaxira savollar olinmoqda");
      result = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
         FROM questions ORDER BY RANDOM() LIMIT $1`,
        [qCount]
      );
    }

    const questions = result.rows;

    // Hech qanday savol topilmasa — jangni boshlamaymiz
    if (questions.length === 0) {
      io.to(humanPlayer.socketId).emit("battleError", { message: "Hozircha savollar mavjud emas. Keyinroq urinib ko'ring." });
      console.error("Bazada umuman savol yo'q!");
      return;
    }
    const botId = "bot_" + roomId;

    // Jang holatini saqlash (bot ham bor)
    battles[roomId] = {
      questions: questions,
      isBot: true,
      botId: botId,
      level: humanPlayer.level || "A1",
      lengthKey: humanPlayer.lengthKey || "standard",
      mode: humanPlayer.mode || "ranked",
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

// Jamoa janglar navbati (eski — endi ishlatilmaydi, xavfsizlik uchun qoldirildi)
const teamQueues = { duo: [], squad: [] };
const teamQueueTimers = {};

// ===== YAGONA JAMOA MATCHMAKING POOL (party + solo birga) =====
const teamMatchPool = { duo: [], squad: [] }; // entry: {id, type:"solo"|"party", size, players:[...], partyId?}
const teamMatchTimers = {};

// Navbat holatini barcha kutayotganlarga yuborish
function emitTeamQueueStatus(mode) {
  var teamSize = mode === "squad" ? 4 : 2;
  var needed = teamSize * 2;
  var pool = teamMatchPool[mode];
  var count = pool.reduce(function (s, e) { return s + e.size; }, 0);
  pool.forEach(function (e) {
    e.players.forEach(function (p) {
      if (!p.isBot && p.socketId) io.to(p.socketId).emit("teamQueueUpdate", { current: count, needed: needed, teamMode: mode });
    });
  });
}

// 2 ta jamoa tuzishga harakat (party butun bir jamoaga, solo bo'sh joyni to'ldiradi)
function tryFormTeamMatch(mode) {
  var teamSize = mode === "squad" ? 4 : 2;
  var pool = teamMatchPool[mode];
  if (pool.length === 0) return false;

  function assembleTeam(avail) {
    var team = [], used = [];
    // Avval party joylaymiz (guruh buzilmaydi)
    for (var i = 0; i < avail.length && team.length < teamSize; i++) {
      var e = avail[i];
      if (e.type === "party" && e.size <= (teamSize - team.length)) {
        team = team.concat(e.players); used.push(e.id);
        avail.splice(i, 1); i--;
      }
    }
    // Qolgan joyni solo bilan to'ldiramiz
    for (var j = 0; j < avail.length && team.length < teamSize; j++) {
      var e2 = avail[j];
      if (e2.type === "solo") {
        team = team.concat(e2.players); used.push(e2.id);
        avail.splice(j, 1); j--;
      }
    }
    return team.length === teamSize ? { team: team, used: used } : null;
  }

  var avail = pool.slice();
  var A = assembleTeam(avail);
  if (!A) return false;
  var B = assembleTeam(avail);
  if (!B) return false;

  var usedIds = A.used.concat(B.used);
  teamMatchPool[mode] = pool.filter(function (e) { return usedIds.indexOf(e.id) === -1; });
  if (teamMatchPool[mode].length === 0 && teamMatchTimers[mode]) { clearTimeout(teamMatchTimers[mode]); delete teamMatchTimers[mode]; }

  console.log("Jamoa match topildi [" + mode + "]: A=" + A.team.length + " B=" + B.team.length + " (haqiqiy o'yinchilar)");
  startTeamBattle(A.team.concat(B.team), mode, teamSize);
  return true;
}

// Vaqt tugadi — kutayotganlarni bot bilan to'ldirib jang boshlash
function botFillTeamMatch(mode) {
  var teamSize = mode === "squad" ? 4 : 2;
  var pool = teamMatchPool[mode];
  if (pool.length === 0) return;

  var avail = pool.slice();
  teamMatchPool[mode] = [];
  if (teamMatchTimers[mode]) { clearTimeout(teamMatchTimers[mode]); delete teamMatchTimers[mode]; }

  function takeTeam() {
    var team = [];
    for (var i = 0; i < avail.length && team.length < teamSize; i++) {
      if (avail[i].type === "party" && avail[i].size <= (teamSize - team.length)) { team = team.concat(avail[i].players); avail.splice(i, 1); i--; }
    }
    for (var j = 0; j < avail.length && team.length < teamSize; j++) {
      if (avail[j].type === "solo") { team = team.concat(avail[j].players); avail.splice(j, 1); j--; }
    }
    return team;
  }
  var teamA = takeTeam();
  var teamB = takeTeam();
  var ref = teamA[0] || teamB[0];
  var bi = 0;
  while (teamA.length < teamSize) teamA.push(makeTeamBot(ref, bi++));
  while (teamB.length < teamSize) teamB.push(makeTeamBot(ref, bi++));

  console.log("Jamoa match bot bilan to'ldirildi [" + mode + "]");
  startTeamBattle(teamA.concat(teamB), mode, teamSize);
}

// Poolga entry qo'shish + match urinishi + bot-fill timer
function addTeamEntry(mode, entry) {
  teamMatchPool[mode].push(entry);
  emitTeamQueueStatus(mode);
  var formed = tryFormTeamMatch(mode);
  if (!formed) {
    if (teamMatchTimers[mode]) clearTimeout(teamMatchTimers[mode]);
    teamMatchTimers[mode] = setTimeout(function () { botFillTeamMatch(mode); }, 15000);
  }
}
const pendingBattles = {}; // Do'st janglari: battle.html'da tayyor bo'lishni kutayotgan
const onlineUsers = {}; // { userId: socketId }

// ============ PARTY (Do'stlar jamoasi) ============
const parties = {};      // { partyId: { leader, teamMode, maxSize, members: [{userId, name, socketId, isLeader}], status } }
const userParty = {};    // { userId: partyId } — tez qidirish uchun

function makePartyId() { return "party_" + Date.now() + "_" + Math.floor(Math.random() * 10000); }

// Party holatini barcha a'zolarga yuborish
function broadcastParty(partyId) {
  var party = parties[partyId];
  if (!party) return;
  var payload = {
    partyId: partyId,
    teamMode: party.teamMode,
    maxSize: party.maxSize,
    status: party.status,
    leaderId: party.leader,
    members: party.members.map(function (m) { return { userId: m.userId, name: m.name, isLeader: m.userId === party.leader, profile_picture: m.profile_picture || null }; }),
  };
  party.members.forEach(function (m) {
    if (m.socketId) io.to(m.socketId).emit("partyUpdated", payload);
  });
}

// A'zoni partydan chiqarish (disconnect yoki leave)
function removeFromParty(userId) {
  var partyId = userParty[userId];
  if (!partyId) return;
  var party = parties[partyId];
  if (!party) { delete userParty[userId]; return; }

  party.members = party.members.filter(function (m) { return m.userId !== userId; });
  delete userParty[userId];

  if (party.members.length === 0) {
    // Bo'sh party — o'chiramiz
    delete parties[partyId];
    return;
  }

  // Agar lider chiqgan bo'lsa — keyingi a'zo lider bo'ladi
  if (party.leader === userId) {
    party.leader = party.members[0].userId;
  }
  broadcastParty(partyId);
}

// Pending party janglar (a'zolar team-battle.html ga yetib kelishini kutadi)
const pendingPartyMatches = {}; // { partyId: { teamMode, teamSize, expected:[uid], arrived:{uid:{...}}, timer } }

var TEAM_BOT_NAMES = ["Sardor", "Jasur", "Aziz", "Bobur", "Dilshod", "Kamol", "Nodir", "Olim", "Rustam", "Sherzod", "Tohir", "Umid"];
function makeTeamBot(refPlayer, idx) {
  var bn = TEAM_BOT_NAMES[Math.floor(Math.random() * TEAM_BOT_NAMES.length)];
  return {
    socketId: "pbot_" + Date.now() + "_" + idx + "_" + Math.floor(Math.random() * 1000),
    userId: null,
    name: bn,
    level: refPlayer ? refPlayer.level : "A1",
    lengthKey: refPlayer ? refPlayer.lengthKey : "standard",
    rating: (refPlayer && refPlayer.rating ? Math.max(800, refPlayer.rating + Math.floor(Math.random() * 200 - 100)) : (1000 + Math.floor(Math.random() * 700))),
    isBot: true,
  };
}

// Party jang qidiruvi — party butun guruh sifatida YAGONA POOLGA kiradi
function startPartyBattle(partyId) {
  var pending = pendingPartyMatches[partyId];
  if (!pending) return;
  delete pendingPartyMatches[partyId];

  var teamMode = pending.teamMode;
  var teamSize = pending.teamSize;
  var arrivedPlayers = Object.keys(pending.arrived).map(function (uid) { return pending.arrived[uid]; });
  if (arrivedPlayers.length === 0) return;

  // Xavfsizlik: party a'zolari teamSize dan oshmasin
  if (arrivedPlayers.length > teamSize) arrivedPlayers = arrivedPlayers.slice(0, teamSize);

  // Party holatini tozalaymiz (endi jang qidiruvida)
  if (parties[partyId]) {
    parties[partyId].members.forEach(function (m) { delete userParty[m.userId]; });
    delete parties[partyId];
  }

  // Partyni yagona poolga qo'shamiz — party vs party / party vs solo / (yetmasa) bot
  var entry = {
    id: "party_" + partyId,
    type: "party",
    size: arrivedPlayers.length,
    players: arrivedPlayers,
    partyId: partyId,
  };
  console.log("Party poolga qo'shildi [" + teamMode + "]: party=" + partyId + " (" + arrivedPlayers.length + " a'zo)");
  addTeamEntry(teamMode, entry);
}


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
    // Tanlangan format bo'yicha savol soni (player1 tanlovi)
    const cfg = lengthConfig(player1.lengthKey);
    const qCount = cfg.questions;
    console.log("[BATTLE DEBUG] startBattle. player1.lengthKey:", player1.lengthKey, "| qCount (kerakli):", qCount, "| level:", player1.level);

    let result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2`,
      [player1.level, qCount]
    );

    // Zaxira: bu daraja uchun savol bo'lmasa, har qanday darajadan olamiz
    if (result.rows.length === 0) {
      console.log("'" + player1.level + "' uchun savol yo'q — zaxira savollar olinmoqda");
      result = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
         FROM questions ORDER BY RANDOM() LIMIT $1`,
        [qCount]
      );
    }

    const questions = result.rows;
    console.log("[BATTLE DEBUG] Bazadan olingan savollar soni:", questions.length, "(kerakli:", qCount, ")");

    // Hech qanday savol topilmasa — ikkala o'yinchiga xato yuboramiz
    if (questions.length === 0) {
      io.to(player1.socketId).emit("battleError", { message: "Hozircha savollar mavjud emas. Keyinroq urinib ko'ring." });
      io.to(player2.socketId).emit("battleError", { message: "Hozircha savollar mavjud emas. Keyinroq urinib ko'ring." });
      console.error("Bazada umuman savol yo'q!");
      return;
    }

    // Jang holatini saqlash
    battles[roomId] = {
      questions: questions,
      level: player1.level || "A1",
      lengthKey: player1.lengthKey || "standard",
      mode: player1.mode || "ranked",
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

  // ===== BATTLE CHAT (V1: emotes + free chat + spam cooldown) =====
  socket.chatLast = 0;
  socket.chatTimes = [];
  socket.on("battleChatSend", ({ roomId, message }) => {
    const battle = battles[roomId];
    if (!battle || !battle.players[socket.id]) return; // bu battle ichidagi o'yinchi emas
    if (!message || typeof message !== "string") return;

    let text = message.trim().slice(0, 120); // uzunlik 120 belgi
    if (!text) return;

    // Spam cooldown: 2 soniyada bir marta
    const now = Date.now();
    if (now - socket.chatLast < 2000) {
      socket.emit("battleChatError", { message: "Juda tez yozyapsiz. Biroz kuting." });
      return;
    }
    // 10 soniyada maksimum 5 xabar
    socket.chatTimes = socket.chatTimes.filter(t => now - t < 10000);
    if (socket.chatTimes.length >= 5) {
      socket.emit("battleChatError", { message: "Juda ko'p xabar yubordingiz. Biroz kuting." });
      return;
    }
    socket.chatLast = now;
    socket.chatTimes.push(now);

    const sender = battle.players[socket.id];
    io.to(roomId).emit("battleChatMessage", {
      senderId: sender.userId || null,
      senderName: sender.name || "O'yinchi",
      message: text,
      createdAt: new Date().toISOString(),
    });

    // Moderatsiya uchun xabarni bazaga saqlaymiz (faqat haqiqiy o'yinchi, bot emas)
    if (sender.userId) {
      pool.query(
        "INSERT INTO chat_messages (room_id, sender_id, sender_name, message) VALUES ($1, $2, $3, $4)",
        [roomId, sender.userId, sender.name || "O'yinchi", text]
      ).catch(function (e) { console.error("Chat saqlash xatosi:", e.message); });
    }
  });

  // User disconnect
  socket.on("disconnect", () => {
    const userId = socket.userId;

    if (userId && onlineUsers[userId] === socket.id) {
      delete onlineUsers[userId];

      console.log("User offline:", userId);

      notifyFriendsStatus(userId, false);

      // Partydan ham chiqaramiz
      removeFromParty(String(userId));
    }

    console.log("Socket disconnected:", socket.id);
  });

  // Rematch: bir o'yinchi qayta jang so'raydi
  socket.on("requestRematch", ({ opponentId, myUserId, myName, level, lengthKey }) => {
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
      lengthKey: lengthKey || "standard",
    });
  });

  // Rematch javobi
  socket.on("rematchResponse", async ({ accepted, fromSocketId, fromUserId, fromName, myUserId, myName, level, lengthKey }) => {
    const requesterSocket = io.sockets.sockets.get(fromSocketId);
    if (!accepted) {
      if (requesterSocket) requesterSocket.emit("rematchDeclined", { byName: myName });
      return;
    }
    const lk = lengthKey || "standard";
    const roomId = "friend_battle_rematch_" + fromSocketId + "_" + socket.id + "_" + Date.now();

    let fromPic = null, myPic = null;
    try {
      const picRes = await pool.query("SELECT id, profile_picture FROM users WHERE id = ANY($1)", [[fromUserId, myUserId]]);
      picRes.rows.forEach(r => {
        if (String(r.id) === String(fromUserId)) fromPic = r.profile_picture;
        if (String(r.id) === String(myUserId)) myPic = r.profile_picture;
      });
    } catch (e) {}

    const fromCard = await getOpponentCardInfo(fromUserId);
    const myCard = await getOpponentCardInfo(myUserId);

    // Do'st jangi kabi: ikki o'yinchi battle.html'ga qayta o'tadi (found ekran + countdown)
    pendingBattles[roomId] = {
      lengthKey: lk,
      player1: { userId: fromUserId, name: fromName, level: level || "A1", lengthKey: lk, ready: false, socketId: null },
      player2: { userId: myUserId, name: myName, level: level || "A1", lengthKey: lk, ready: false, socketId: null },
    };

    if (requesterSocket) {
      requesterSocket.emit("matchFound", { roomId, opponent: { name: myName, profile_picture: myPic, rating: myCard.rating, level: level || "A1" }, lengthKey: lk, redirect: true, message: "Rematch qabul qilindi!" });
    }
    socket.emit("matchFound", { roomId, opponent: { name: fromName, profile_picture: fromPic, rating: fromCard.rating, level: level || "A1" }, lengthKey: lk, redirect: true, message: "Siz rematchni qabul qildingiz!" });
  });

  // ============ PARTY HANDLERLAR ============

  // Party yaratish (lider bo'lib)
  socket.on("createParty", ({ userId, name, teamMode, profile_picture }) => {
    if (!userId) return;
    var uid = String(userId);

    // Avvalgi partydan chiqaramiz (agar bor bo'lsa)
    if (userParty[uid]) removeFromParty(uid);

    var mode = teamMode === "squad" ? "squad" : "duo";
    var maxSize = mode === "squad" ? 4 : 2;
    var partyId = makePartyId();

    parties[partyId] = {
      leader: uid,
      teamMode: mode,
      maxSize: maxSize,
      status: "forming",
      members: [{ userId: uid, name: name || "O'yinchi", socketId: socket.id, isLeader: true, profile_picture: profile_picture || null }],
    };
    userParty[uid] = partyId;

    socket.emit("partyCreated", { partyId: partyId });
    broadcastParty(partyId);
    console.log("Party yaratildi [" + mode + "]: " + partyId + " lider:" + uid);
  });

  // Do'stni partyga taklif qilish
  socket.on("inviteToParty", ({ partyId, fromName, toUserId }) => {
    var party = parties[partyId];
    if (!party) { socket.emit("partyError", { message: "Party topilmadi" }); return; }
    if (party.members.length >= party.maxSize) { socket.emit("partyError", { message: "Party to'la" }); return; }

    var targetSocket = onlineUsers[String(toUserId)];
    if (!targetSocket) { socket.emit("partyError", { message: "Do'stingiz hozir onlayn emas" }); return; }

    // Do'st allaqachon shu partyda bo'lsa
    if (party.members.find(function (m) { return m.userId === String(toUserId); })) {
      socket.emit("partyError", { message: "Bu o'yinchi allaqachon partyda" });
      return;
    }

    io.to(targetSocket).emit("partyInviteReceived", {
      partyId: partyId,
      fromName: fromName || "O'yinchi",
      teamMode: party.teamMode,
    });
    socket.emit("partyInviteSent", { toUserId: String(toUserId) });
    console.log("Party taklif: " + partyId + " -> " + toUserId);
  });

  // Taklifni qabul qilish
  socket.on("acceptPartyInvite", ({ partyId, userId, name, profile_picture }) => {
    var party = parties[partyId];
    if (!party) { socket.emit("partyError", { message: "Party endi mavjud emas" }); return; }
    if (party.members.length >= party.maxSize) { socket.emit("partyError", { message: "Party to'lib qoldi" }); return; }

    var uid = String(userId);
    // Avvalgi partydan chiqaramiz
    if (userParty[uid] && userParty[uid] !== partyId) removeFromParty(uid);

    // Allaqachon a'zomi?
    if (!party.members.find(function (m) { return m.userId === uid; })) {
      party.members.push({ userId: uid, name: name || "O'yinchi", socketId: socket.id, isLeader: false, profile_picture: profile_picture || null });
      userParty[uid] = partyId;
    }
    broadcastParty(partyId);
    console.log("Party qo'shildi: " + uid + " -> " + partyId);
  });

  // Taklifni rad etish
  socket.on("declinePartyInvite", ({ partyId, name }) => {
    var party = parties[partyId];
    if (!party) return;
    var leaderSocket = onlineUsers[party.leader];
    if (leaderSocket) io.to(leaderSocket).emit("partyInviteDeclined", { byName: name || "Do'stingiz" });
  });

  // Partydan chiqish
  socket.on("leaveParty", ({ userId }) => {
    removeFromParty(String(userId));
    socket.emit("partyLeft", {});
  });

  // Lider party jangini boshlaydi
  socket.on("startPartyQueue", ({ partyId, userId }) => {
    var party = parties[partyId];
    if (!party) { socket.emit("partyError", { message: "Party topilmadi" }); return; }
    if (String(party.leader) !== String(userId)) { socket.emit("partyError", { message: "Faqat lider boshlay oladi" }); return; }
    if (party.members.length < 2) { socket.emit("partyError", { message: "Kamida 2 o'yinchi kerak" }); return; }

    party.status = "in_battle";

    // Pending match yaratamiz (a'zolar yetib kelishini kutadi)
    pendingPartyMatches[partyId] = {
      teamMode: party.teamMode,
      teamSize: party.maxSize,
      expected: party.members.map(function (m) { return String(m.userId); }),
      arrived: {},
      timer: null,
    };

    // Hamma a'zoga team-battle.html ga o'tishni aytamiz
    party.members.forEach(function (m) {
      if (m.socketId) io.to(m.socketId).emit("partyMatchStarting", { teamMode: party.teamMode, partyId: partyId });
    });
    console.log("Party queue boshlandi: " + partyId + " (" + party.members.length + " a'zo)");
  });

  // team-battle.html dan: party a'zosi yetib keldi
  socket.on("joinPartyMatch", ({ partyId, userId, name, level, lengthKey, profile_picture }) => {
    var pending = pendingPartyMatches[partyId];
    if (!pending) {
      // Pending yo'q (kech qoldi yoki xato) — solo team matchga tushiramiz
      io.to(socket.id).emit("partyMatchExpired", {});
      return;
    }
    var uid = String(userId);
    pending.arrived[uid] = { socketId: socket.id, userId: uid, name: name || "O'yinchi", level: level || "A1", rating: 1000, lengthKey: lengthKey || "standard", profile_picture: profile_picture || null };

    console.log("Party a'zosi yetib keldi: " + uid + " -> " + partyId + " (" + Object.keys(pending.arrived).length + "/" + pending.expected.length + ")");

    // Hamma yetib keldimi?
    var allArrived = pending.expected.every(function (eid) { return pending.arrived[eid]; });
    if (allArrived) {
      if (pending.timer) clearTimeout(pending.timer);
      startPartyBattle(partyId);
    } else if (!pending.timer) {
      // 12s ichida hamma kelmasa — kelganlar bilan boshlaymiz
      pending.timer = setTimeout(function () { startPartyBattle(partyId); }, 12000);
    }
  });

  // Do'stga jang chaqiruvi yuborish
  socket.on("challengeFriend", async ({ fromUserId, fromName, toUserId, level, lengthKey }) => {
    console.log("Chaqiruv:", fromUserId, "->", toUserId, "| Onlayn:", Object.keys(onlineUsers));
    const targetSocketId = onlineUsers[String(toUserId)];

    if (!targetSocketId) {
      socket.emit("challengeResult", { success: false, message: "Do'stingiz hozir onlayn emas" });
      return;
    }

    // Chaqiruvchining rasmini olamiz (modal uchun)
    let fromPic = null;
    try {
      const r = await pool.query("SELECT profile_picture FROM users WHERE id = $1", [fromUserId]);
      if (r.rows[0]) fromPic = r.rows[0].profile_picture;
    } catch (e) {}

    io.to(targetSocketId).emit("challengeReceived", {
      fromUserId: fromUserId,
      fromName: fromName,
      fromSocketId: socket.id,
      fromPic: fromPic,
      level: level,
      lengthKey: lengthKey || "standard",
    });

    socket.emit("challengeResult", { success: true, message: "Chaqiruv yuborildi, javob kutilmoqda..." });
  });

  // Chaqiruvni bekor qilish (yuboruvchi) — do'stdagi taklifni yo'qotamiz
  socket.on("cancelChallenge", ({ fromUserId, toUserId }) => {
    const targetSocketId = onlineUsers[String(toUserId)];
    if (targetSocketId) {
      io.to(targetSocketId).emit("challengeCancelled", { fromUserId });
    }
  });

  // Chaqiruvga javob (qabul yoki rad)
  socket.on("challengeResponse", async ({ accepted, fromSocketId, fromUserId, fromName, myUserId, myName, level, lengthKey }) => {
    const challengerSocket = io.sockets.sockets.get(fromSocketId);

    if (!accepted) {
      if (challengerSocket) {
        challengerSocket.emit("challengeDeclined", { byName: myName });
      }
      return;
    }

    const lk = lengthKey || "standard";
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

    // Reyting + win rate (1v1 kabi to'liq karta)
    const fromCard = await getOpponentCardInfo(fromUserId);
    const myCard = await getOpponentCardInfo(myUserId);

    if (challengerSocket) {
      challengerSocket.emit("matchFound", {
        roomId: roomId,
        opponent: { name: myName, profile_picture: myPic, rating: myCard.rating, win_rate: myCard.win_rate, level: level || "A1" },
        lengthKey: lk,
        message: "Do'stingiz qabul qildi!",
      });
    }
    socket.emit("matchFound", {
      roomId: roomId,
      opponent: { name: fromName, profile_picture: fromPic, rating: fromCard.rating, win_rate: fromCard.win_rate, level: level || "A1" },
      lengthKey: lk,
      message: "Jang boshlanmoqda!",
    });

    // Do'st jangi: darrov boshlamaymiz. Ikki o'yinchi battle.html'ga o'tib "tayyorman" deganda boshlanadi.
    pendingBattles[roomId] = {
      lengthKey: lk,
      player1: { userId: fromUserId, name: fromName, level: level || "A1", lengthKey: lk, ready: false, socketId: null },
      player2: { userId: myUserId, name: myName, level: level || "A1", lengthKey: lk, ready: false, socketId: null },
    };
  });

  console.log("Yangi o'yinchi ulandi:", socket.id);

  // Do'st jangi: battle.html ochilganda yangi socket room'ga qo'shiladi

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
      const lk = pending.lengthKey || pending.player1.lengthKey || "standard";
      const p1 = { socketId: pending.player1.socketId, userId: pending.player1.userId, name: pending.player1.name, level: pending.player1.level, lengthKey: lk };
      const p2 = { socketId: pending.player2.socketId, userId: pending.player2.userId, name: pending.player2.name, level: pending.player2.level, lengthKey: lk };
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
        lengthKey: playerData.lengthKey || "standard",
        mode: playerData.mode || "ranked",
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

          // 7 soniyadan keyin bot bilan jang boshlanadi (countdown bilan mos)
          setTimeout(() => startBotBattle(roomId, player), 6000);
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
        const botPlayer = { socketId: socket.id, userId: playerData.userId, name: playerData.name || "O'yinchi", level: myLevel, lengthKey: playerData.lengthKey || "standard", botName: botName2 };
        setTimeout(() => startBotBattle(roomIdBot, botPlayer), 6000);
        return;
      }

      const opponent = waitingPlayer;
      waitingPlayer = null;

      const roomId = "battle_" + opponent.socketId + "_" + socket.id;
      socket.join(roomId);
      io.sockets.sockets.get(opponent.socketId)?.join(roomId);

      const player1 = opponent;
      const player2 = { socketId: socket.id, userId: playerData.userId, name: playerData.name || "O'yinchi", level: playerData.level || "A1", lengthKey: playerData.lengthKey || "standard", mode: playerData.mode || "ranked" };

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

      // 6 soniyadan keyin jangni boshlaymiz (countdown bilan mos)
      setTimeout(() => startBattle(roomId, player1, player2), 6000);
    }
  });

  // ============ JAMOA MATCHMAKING (Duo 2v2 / Squad 4v4) — yagona pool ============
  socket.on("findTeamMatch", async (playerData) => {
    try {
      var teamMode = playerData.teamMode === "squad" ? "squad" : "duo";
      var entry = {
        id: "solo_" + socket.id + "_" + Date.now(),
        type: "solo",
        size: 1,
        players: [{
          socketId: socket.id,
          userId: playerData.userId,
          name: playerData.name || "O'yinchi",
          level: playerData.level || "A1",
          lengthKey: playerData.lengthKey || "standard",
          rating: playerData.rating || 1000,
          profile_picture: playerData.profile_picture || null,
        }],
      };
      addTeamEntry(teamMode, entry);
    } catch (err) {
      console.error("Jamoa matchmaking xatosi:", err.message);
      io.to(socket.id).emit("battleError", { message: "Jamoa qidirishda xato" });
    }
  });

  // Jamoa qidiruvini bekor qilish (pooldan chiqarish)
  socket.on("cancelTeamMatch", () => {
    ["duo", "squad"].forEach(function (mode) {
      var pool = teamMatchPool[mode];
      var before = pool.length;
      teamMatchPool[mode] = pool.filter(function (e) {
        return !e.players.some(function (p) { return p.socketId === socket.id; });
      });
      if (teamMatchPool[mode].length !== before) emitTeamQueueStatus(mode);
    });
  });

  // Jamoa jangda javob berish
  socket.on("submitTeamAnswer", ({ roomId, questionId, answer }) => {
    var battle = battles[roomId];
    if (!battle || !battle.isTeam) return;
    var player = battle.players[socket.id];
    if (!player || player.finished) return;

    // Savolni topamiz
    var q = battle.questions.find(function (x) { return x.id === questionId; });
    if (!q) return;

    var isCorrect = (answer === q.correct_option);
    if (isCorrect) player.score++;
    player.answers.push({ questionId: q.id, selected: answer, correct: q.correct_option, isCorrect: isCorrect });
    player.answeredCount++;
    if (player.answeredCount >= battle.questions.length) player.finished = true;

    // O'yinchiga javob natijasini yuboramiz
    io.to(socket.id).emit("teamAnswerResult", {
      isCorrect: isCorrect,
      correct_option: q.correct_option,
      answeredCount: player.answeredCount,
      total: battle.questions.length,
      myScore: player.score,
    });

    // Jamoa progressini hammaga yuboramiz
    emitTeamProgress(roomId);

    // Hamma tugatdimi?
    checkTeamFinish(roomId);
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

    // Javob bergan o'yinchining O'ZIGA natijani qaytaramiz (to'g'ri/xato + jonli stat)
    // Server-authoritative: frontend faqat ko'rsatadi, aldab bo'lmaydi
    socket.emit("answerResult", {
      is_correct: isCorrect,
      correct_answer: question ? question.correct_option : null,
      my_score: player.score,          // jami to'g'ri javoblar
      answered: player.answeredCount,  // jami javob berilgan
    });

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

// Jamoa progressini barcha real o'yinchilarga yuborish
function emitTeamProgress(roomId) {
  var battle = battles[roomId];
  if (!battle) return;
  function teamProg(ids) {
    return ids.map(function (sid) {
      var p = battle.players[sid];
      return { name: p.name, answeredCount: p.answeredCount, score: p.score, finished: p.finished, isBot: p.isBot, level: p.level, rating: p.rating };
    });
  }
  var progA = teamProg(battle.teams.A);
  var progB = teamProg(battle.teams.B);
  var totalA = progA.reduce(function (s, p) { return s + p.score; }, 0);
  var totalB = progB.reduce(function (s, p) { return s + p.score; }, 0);

  Object.keys(battle.players).forEach(function (sid) {
    var p = battle.players[sid];
    if (p.isBot) return;
    var myTeam = p.team;
    io.to(sid).emit("teamProgress", {
      myTeamPlayers: myTeam === "A" ? progA : progB,
      enemyTeamPlayers: myTeam === "A" ? progB : progA,
      myTeamScore: myTeam === "A" ? totalA : totalB,
      enemyTeamScore: myTeam === "A" ? totalB : totalA,
    });
  });
}

// Hamma tugatdimi — tekshirib, tugagan bo'lsa finishTeamBattle
function checkTeamFinish(roomId) {
  var battle = battles[roomId];
  if (!battle || battle.finished) return;
  var allFinished = Object.keys(battle.players).every(function (sid) { return battle.players[sid].finished; });
  if (allFinished) finishTeamBattle(roomId);
}

// Bot javoblarini simulyatsiya qilish (jamoa)
function simulateTeamBotAnswers(roomId, botId, questions) {
  var qIndex = 0;
  function answerNext() {
    var battle = battles[roomId];
    if (!battle || battle.finished) return;
    var bot = battle.players[botId];
    if (!bot || bot.finished) return;

    if (qIndex >= questions.length) { bot.finished = true; emitTeamProgress(roomId); checkTeamFinish(roomId); return; }

    var q = questions[qIndex];
    var correct = Math.random() < 0.68; // bot ~68% aniqlik
    if (correct) bot.score++;
    bot.answeredCount++;
    qIndex++;
    if (bot.answeredCount >= questions.length) bot.finished = true;

    emitTeamProgress(roomId);

    if (bot.finished) {
      checkTeamFinish(roomId);
    } else {
      setTimeout(answerNext, 2000 + Math.random() * 3500); // 2-5.5s har savol
    }
  }
  setTimeout(answerNext, 2000 + Math.random() * 3500);
}

// ============ JAMOA JANG (Duo/Squad) ============

// Jamoa jangini boshlash (group = barcha o'yinchilar, 2 jamoaga bo'linadi)
async function startTeamBattle(group, teamMode, teamSize) {
  try {
    var roomId = "team_" + teamMode + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    // Jamoalarga bo'lamiz: birinchi yarmi = A, ikkinchi yarmi = B
    var teamA = group.slice(0, teamSize);
    var teamB = group.slice(teamSize, teamSize * 2);

    // Format va daraja: birinchi o'yinchidan olamiz
    var lengthKey = group[0].lengthKey || "standard";
    var level = group[0].level || "A1";
    var cfg = lengthConfig(lengthKey);
    var qCount = cfg.questions;

    // Savollarni olamiz
    var result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2`,
      [level, qCount]
    );
    if (result.rows.length === 0) {
      result = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
         FROM questions ORDER BY RANDOM() LIMIT $1`,
        [qCount]
      );
    }
    var questions = result.rows;
    if (questions.length === 0) {
      group.forEach(function (p) { io.to(p.socketId).emit("battleError", { message: "Hozircha savollar mavjud emas." }); });
      return;
    }

    // Jang holatini quramiz — players (hammasi) + teams (A/B taqsimot)
    var players = {};
    var teamAIds = [], teamBIds = [];

    teamA.forEach(function (p) {
      players[p.socketId] = { userId: p.userId, name: p.name, level: p.level || "A1", rating: p.rating || 1000, profile_picture: p.profile_picture || null, score: 0, finished: false, answeredCount: 0, answers: [], team: "A", isBot: !!p.isBot };
      teamAIds.push(p.socketId);
    });
    teamB.forEach(function (p) {
      players[p.socketId] = { userId: p.userId, name: p.name, level: p.level || "A1", rating: p.rating || 1000, profile_picture: p.profile_picture || null, score: 0, finished: false, answeredCount: 0, answers: [], team: "B", isBot: !!p.isBot };
      teamBIds.push(p.socketId);
    });

    battles[roomId] = {
      isTeam: true,
      teamMode: teamMode,
      questions: questions,
      level: level,
      lengthKey: lengthKey,
      teams: { A: teamAIds, B: teamBIds },
      players: players,
    };

    // Savollarni xavfsiz (to'g'ri javobsiz) tayyorlaymiz
    var safeQuestions = questions.map(function (q) {
      return { id: q.id, question_text: q.question_text, option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d };
    });

    // Har o'yinchiga jang boshlanishini yuboramiz (o'z jamoasi va raqib jamoasi ma'lumoti bilan)
    function teamInfo(ids) {
      return ids.map(function (sid) { return { name: players[sid].name, isBot: players[sid].isBot, userId: players[sid].userId, level: players[sid].level, rating: players[sid].rating, profile_picture: players[sid].profile_picture }; });
    }
    var infoA = teamInfo(teamAIds);
    var infoB = teamInfo(teamBIds);

    group.forEach(function (p) {
      if (p.isBot) return; // botga yuborilmaydi
      var myTeam = players[p.socketId].team;
      io.to(p.socketId).emit("teamBattleStart", {
        roomId: roomId,
        teamMode: teamMode,
        level: level,
        total_questions: safeQuestions.length,
        questions: safeQuestions,
        myTeam: myTeam,
        myTeamPlayers: myTeam === "A" ? infoA : infoB,
        enemyTeamPlayers: myTeam === "A" ? infoB : infoA,
      });
    });

    console.log("Jamoa jang boshlandi [" + teamMode + "]: " + roomId + " | A:" + teamAIds.length + " B:" + teamBIds.length);

    // Botlar javobini simulyatsiya qilamiz
    [].concat(teamAIds, teamBIds).forEach(function (sid) {
      if (players[sid].isBot) simulateTeamBotAnswers(roomId, sid, questions);
    });
  } catch (err) {
    console.error("startTeamBattle xatosi:", err.message);
  }
}

// Navbatni bot bilan to'ldirish (yetarli real o'yinchi yo'q bo'lsa)
function fillTeamWithBots(teamMode, teamSize, needed) {
  try {
    var queue = teamQueues[teamMode];
    if (queue.length === 0) return; // hech kim yo'q

    var botNames = ["Sardor", "Jasur", "Aziz", "Bobur", "Dilshod", "Kamol", "Nodir", "Olim", "Rustam", "Sherzod"];
    var group = queue.splice(0, queue.length); // mavjud real o'yinchilar

    // Yetishmagan joylarni bot bilan to'ldiramiz
    var botsNeeded = needed - group.length;
    for (var i = 0; i < botsNeeded; i++) {
      var bn = botNames[Math.floor(Math.random() * botNames.length)];
      group.push({
        socketId: "tbot_" + teamMode + "_" + Date.now() + "_" + i,
        userId: null,
        name: bn,
        level: group[0] ? group[0].level : "A1",
        lengthKey: group[0] ? group[0].lengthKey : "standard",
        rating: 1000,
        isBot: true,
      });
    }

    console.log("Jamoa navbati bot bilan to'ldirildi [" + teamMode + "]: " + group.length + " o'yinchi (" + botsNeeded + " bot)");
    if (teamQueueTimers[teamMode]) { clearTimeout(teamQueueTimers[teamMode]); delete teamQueueTimers[teamMode]; }
    startTeamBattle(group, teamMode, teamSize);
  } catch (err) {
    console.error("fillTeamWithBots xatosi:", err.message);
  }
}

// ===== SCHOOL BATTLE: maktabga ochko yig'ish =====
function currentSeason() {
  var d = new Date();
  var q = Math.floor(d.getMonth() / 3) + 1; // 3 oylik mavsum (chorak): Yan-Mar=1, Apr-Iyun=2...
  return d.getFullYear() + "-S" + q; // masalan "2026-S2"
}

async function awardSchoolPoints(userId, points, source) {
  if (!userId || !points || points <= 0) return;
  try {
    var u = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
    if (!u.rows[0] || !u.rows[0].school) return; // maktab tanlanmagan — ochko yo'q
    var row = u.rows[0];
    await pool.query(
      `INSERT INTO school_battle_points (user_id, region, district, school, points, source, season)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, row.region, row.district, row.school, points, source, currentSeason()]
    );
    console.log("School ochko: +" + points + " (" + source + ") -> " + row.school + " [user " + userId + "]");
  } catch (err) {
    console.error("School Battle ochko xatosi:", err.message);
  }
}



// Jamoa jangini yakunlash — jamoa balli (a'zolar yig'indisi), g'olib jamoa, baza
async function finishTeamBattle(roomId) {
  var battle = battles[roomId];
  if (!battle || battle.finished) return;
  battle.finished = true; // ikki marta yakunlanmasligi uchun

  // Jamoa ballari = a'zolar ballari yig'indisi
  function teamTotal(ids) {
    return ids.reduce(function (s, sid) { return s + battle.players[sid].score; }, 0);
  }
  var totalA = teamTotal(battle.teams.A);
  var totalB = teamTotal(battle.teams.B);

  var winningTeam = null;
  if (totalA > totalB) winningTeam = "A";
  else if (totalB > totalA) winningTeam = "B";
  // teng bo'lsa — durang

  var RATING_CHANGE = 20;
  var fmtXp = lengthConfig(battle.lengthKey).xp;

  // Jamoa tarkiblari (natijada ko'rsatish uchun)
  function teamRoster(ids) {
    return ids.map(function (sid) {
      var p = battle.players[sid];
      return { name: p.name, score: p.score, isBot: p.isBot };
    });
  }
  var rosterA = teamRoster(battle.teams.A);
  var rosterB = teamRoster(battle.teams.B);

  // Har bir REAL o'yinchini qayta ishlaymiz (botlar saqlanmaydi)
  for (var sid of Object.keys(battle.players)) {
    var me = battle.players[sid];
    if (me.isBot) continue;

    var myTeam = me.team;
    var outcome = "draw";
    var ratingDelta = 0;
    if (winningTeam === myTeam) { outcome = "win"; ratingDelta = RATING_CHANGE; }
    else if (winningTeam !== null) { outcome = "lose"; ratingDelta = -RATING_CHANGE; }

    var xpEarned;
    if (outcome === "win") xpEarned = fmtXp;
    else if (outcome === "draw") xpEarned = Math.round(fmtXp / 2);
    else xpEarned = Math.max(1, Math.round(fmtXp / 4));

    var myTeamScore = (myTeam === "A") ? totalA : totalB;
    var enemyTeamScore = (myTeam === "A") ? totalB : totalA;
    var myRoster = (myTeam === "A") ? rosterA : rosterB;
    var enemyRoster = (myTeam === "A") ? rosterB : rosterA;

    var updatedUser = null;
    if (me.userId) {
      try {
        var oldRatingResult = await pool.query("SELECT rating FROM users WHERE id = $1", [me.userId]);
        var oldRating = oldRatingResult.rows[0] ? oldRatingResult.rows[0].rating : 1000;

        var streakSql;
        if (outcome === "win") streakSql = "win_streak = win_streak + 1, best_win_streak = GREATEST(best_win_streak, win_streak + 1)";
        else if (outcome === "lose") streakSql = "win_streak = 0";
        else streakSql = "win_streak = win_streak";

        var result = await pool.query(
          `UPDATE users SET xp = xp + $1, rating = GREATEST(0, rating + $2), ${streakSql}
           WHERE id = $3
           RETURNING id, first_name, last_name, email, cefr_level, xp, rating, coins, win_streak, best_win_streak`,
          [xpEarned, ratingDelta, me.userId]
        );
        if (result.rows.length > 0) {
          updatedUser = result.rows[0];
          var oldLeague = getLeagueName(oldRating);
          var newLeague = getLeagueName(updatedUser.rating);
          if (oldLeague !== newLeague) {
            me.leagueChange = { old: oldLeague, new: newLeague, promoted: updatedUser.rating > oldRating };
          }
        }

        // Jang tarixiga yozish (raqib = raqib jamoa)
        var enemyLabel = (battle.teamMode === "squad" ? "Squad" : "Duo") + " jamoa";
        await pool.query(
          `INSERT INTO battle_history
           (user_id, opponent_name, opponent_id, my_score, opponent_score, outcome, xp_earned, rating_change, cefr_level, mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [me.userId, enemyLabel, null, myTeamScore, enemyTeamScore, outcome, xpEarned, ratingDelta, battle.level || "A1", "school"]
        );
        await updateQuestProgress(me.userId, { won: outcome === "win", correctAnswers: me.score, xpEarned: xpEarned });

        // === SCHOOL BATTLE: maktabga ochko (win/draw — bot ham hisoblanadi) ===
        var spTeam = (outcome === "win") ? 15 : (outcome === "draw" ? 7 : 0);
        if (spTeam > 0) await awardSchoolPoints(me.userId, spTeam, "team_" + outcome);
      } catch (err) {
        console.error("Jamoa natijani saqlashda xato:", err.message);
      }
    }

    // O'yinchiga natija yuboramiz
    io.to(sid).emit("teamBattleEnd", {
      outcome: outcome,
      teamMode: battle.teamMode,
      myTeam: myTeam,
      myTeamScore: myTeamScore,
      enemyTeamScore: enemyTeamScore,
      myTeamPlayers: myRoster,
      enemyTeamPlayers: enemyRoster,
      myScore: me.score,
      total: battle.questions.length,
      lengthKey: battle.lengthKey || "standard",
      xp_earned: xpEarned,
      rating_change: ratingDelta,
      updated_user: updatedUser,
      answers: me.answers || [],
      league_change: me.leagueChange || null,
    });
  }

  console.log("Jamoa jang tugadi [" + battle.teamMode + "]: " + roomId + " | A:" + totalA + " B:" + totalB + " | G'olib: " + (winningTeam || "Durang"));
  // Jangni biroz keyin o'chiramiz (qayta ulanishlar uchun)
  setTimeout(function () { delete battles[roomId]; }, 30000);
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
    // Casual rejimda reyting o'zgarmaydi (faqat XP)
    var isCasual = battle.mode === "casual";
    if (isCasual) ratingDelta = 0;

    // Tanlangan format bo'yicha XP (Quick=4, Standard=8, Extended=12, Marathon=16)
    const fmtXp = lengthConfig(battle.lengthKey).xp;
    let xpEarned;
    if (outcome === "win") xpEarned = fmtXp;              // g'alaba — to'liq format XP
    else if (outcome === "draw") xpEarned = Math.round(fmtXp / 2); // durang — yarmi
    else xpEarned = Math.max(1, Math.round(fmtXp / 4));   // mag'lubiyat — ishtirok uchun ozroq

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

        // Win streak mantiqi: g'alaba => +1, mag'lubiyat => 0, durang => o'zgarmaydi
        // best_win_streak — eng yuqori rekord (hech qachon kamaymaydi)
        let streakSql;
        if (outcome === "win") {
          // Yutdi: win_streak +1, agar yangi rekord bo'lsa best_win_streak ham yangilanadi
          streakSql = "win_streak = win_streak + 1, best_win_streak = GREATEST(best_win_streak, win_streak + 1)";
        } else if (outcome === "lose") {
          // Yutqazdi: streak uziladi
          streakSql = "win_streak = 0";
        } else {
          // Durang: o'zgarmaydi (eski qiymatni saqlaymiz)
          streakSql = "win_streak = win_streak";
        }

        const result = await pool.query(
          `UPDATE users
           SET xp = xp + $1,
               rating = GREATEST(0, rating + $2),
               ${streakSql}
           WHERE id = $3
           RETURNING id, first_name, last_name, email, cefr_level, xp, rating, coins, win_streak, best_win_streak`,
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
           (user_id, opponent_name, opponent_id, my_score, opponent_score, outcome, xp_earned, rating_change, cefr_level, mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [me.userId, opp.name, opp.userId || null, me.score, opp.score, outcome, xpEarned, ratingDelta, battle.level || "A1", (battle.mode === "casual" ? "casual" : "ranked")]
        );
        // Topshiriqlar progressini yangilash
        await updateQuestProgress(me.userId, {
          won: outcome === "win",
          correctAnswers: me.score,
          xpEarned: xpEarned,
        });

        // === SCHOOL BATTLE: maktabga ochko (ranked + win/draw — bot ham hisoblanadi) ===
        if (!isCasual) {
          var sp1v1 = (outcome === "win") ? 10 : (outcome === "draw" ? 5 : 0);
          if (sp1v1 > 0) await awardSchoolPoints(me.userId, sp1v1, "ranked_" + outcome);
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
      lengthKey: battle.lengthKey || "standard",
      mode: battle.mode || "ranked",
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

// ===== SCHOOL BATTLE: maktablar reytingi =====
app.get("/school-battle/rankings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const scope = ["national", "region", "district"].includes(req.query.scope) ? req.query.scope : "national";
    const period = ["all", "week", "month", "season"].includes(req.query.period) ? req.query.period : "all";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = 50;
    const offset = (page - 1) * pageSize;

    const ur = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0] || {};

    // Filtrlarni quramiz
    const conds = [];
    const params = [];
    let pi = 1;
    if (period === "week") conds.push("created_at >= date_trunc('week', NOW())");
    else if (period === "month") conds.push("created_at >= date_trunc('month', NOW())");
    else if (period === "season") { conds.push(`season = $${pi++}`); params.push(currentSeason()); }
    if (scope === "region") { conds.push(`region = $${pi++}`); params.push(me.region); }
    else if (scope === "district") { conds.push(`region = $${pi++}`); params.push(me.region); conds.push(`district = $${pi++}`); params.push(me.district); }
    const whereSql = conds.length ? "WHERE " + conds.join(" AND ") : "";

    const cte = `
      WITH ranked AS (
        SELECT region, district, school,
               SUM(points)::int AS total_points,
               COUNT(DISTINCT user_id)::int AS active_students,
               ROW_NUMBER() OVER (ORDER BY SUM(points) DESC, COUNT(DISTINCT user_id) DESC, school ASC) AS rank
        FROM school_battle_points
        ${whereSql}
        GROUP BY region, district, school
      )`;

    const pageRes = await pool.query(
      `${cte} SELECT *, COUNT(*) OVER() AS total_schools FROM ranked ORDER BY rank LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    let mySchool = null;
    if (me.school) {
      const mineRes = await pool.query(
        `${cte} SELECT * FROM ranked WHERE region = $${pi} AND district = $${pi + 1} AND school = $${pi + 2}`,
        [...params, me.region, me.district, me.school]
      );
      mySchool = mineRes.rows[0] || null;
    }

    const totalSchools = pageRes.rows[0] ? parseInt(pageRes.rows[0].total_schools) : 0;
    const fmt = (r) => ({
      rank: parseInt(r.rank), region: r.region, district: r.district, school: r.school,
      total_points: r.total_points, active_students: r.active_students,
      avg_points: r.active_students ? Math.round(r.total_points / r.active_students) : 0,
      is_mine: !!(me.school && r.region === me.region && r.district === me.district && r.school === me.school),
    });

    res.json({
      scope, period, page, pageSize, total_schools: totalSchools,
      schools: pageRes.rows.map(fmt),
      my_school: mySchool ? fmt(mySchool) : null,
    });
  } catch (err) {
    console.error("School rankings xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'z maktab holati (Dashboard kartasi uchun)
app.get("/school-battle/my", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const ur = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0] || {};
    if (!me.school) return res.json({ has_school: false });

    const tot = await pool.query(
      `SELECT COALESCE(SUM(points),0)::int AS total_points, COUNT(DISTINCT user_id)::int AS active_students
       FROM school_battle_points WHERE region=$1 AND district=$2 AND school=$3`,
      [me.region, me.district, me.school]
    );
    const total_points = tot.rows[0].total_points;
    const active_students = tot.rows[0].active_students;

    const seasonTot = await pool.query(
      `SELECT COALESCE(SUM(points),0)::int AS sp FROM school_battle_points WHERE region=$1 AND district=$2 AND school=$3 AND season=$4`,
      [me.region, me.district, me.school, currentSeason()]
    );
    const season_points = seasonTot.rows[0].sp;

    async function rankIn(cond, prms) {
      const q = await pool.query(
        `SELECT COUNT(*) + 1 AS rank FROM (
           SELECT region, district, school, SUM(points) AS tp FROM school_battle_points
           ${cond ? "WHERE " + cond : ""} GROUP BY region, district, school
         ) s WHERE s.tp > $${prms.length + 1}`,
        [...prms, total_points]
      );
      return parseInt(q.rows[0].rank);
    }
    async function countSchools(cond, prms) {
      const q = await pool.query(
        `SELECT COUNT(*) AS c FROM (SELECT 1 FROM school_battle_points ${cond ? "WHERE " + cond : ""} GROUP BY region, district, school) s`,
        prms
      );
      return parseInt(q.rows[0].c);
    }

    const rank_national = await rankIn("", []);
    const rank_region = await rankIn("region = $1", [me.region]);
    const rank_district = await rankIn("region = $1 AND district = $2", [me.region, me.district]);
    const total_national = await countSchools("", []);
    const total_region = await countSchools("region = $1", [me.region]);
    const total_district = await countSchools("region = $1 AND district = $2", [me.region, me.district]);

    const mine = await pool.query(`SELECT COALESCE(SUM(points),0)::int AS my_points FROM school_battle_points WHERE user_id = $1`, [userId]);
    const my_contribution = mine.rows[0].my_points;
    const myRank = await pool.query(
      `SELECT COUNT(*) + 1 AS rank FROM (
         SELECT user_id, SUM(points) AS up FROM school_battle_points
         WHERE region=$1 AND district=$2 AND school=$3 GROUP BY user_id
       ) c WHERE c.up > $4`,
      [me.region, me.district, me.school, my_contribution]
    );

    res.json({
      has_school: true,
      region: me.region, district: me.district, school: me.school,
      total_points, season_points, active_students,
      rank_national, rank_region, rank_district,
      total_national, total_region, total_district,
      my_contribution, my_rank_in_school: parseInt(myRank.rows[0].rank),
    });
  } catch (err) {
    console.error("School my xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== BIRLASHGAN MAKTAB REYTINGI (Fame + Effort) — rankings.html uchun =====
app.get("/rankings/combined", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const scope = ["schools", "districts", "regions"].includes(req.query.scope) ? req.query.scope : "schools";
    const period = ["all", "week", "month", "season"].includes(req.query.period) ? req.query.period : "season";
    let within = ["country", "region", "district"].includes(req.query.within) ? req.query.within : "country";
    // Tab'ga mos cheklash: regions faqat country; districts faqat region/country
    if (scope === "regions") within = "country";
    if (scope === "districts" && within === "district") within = "region";

    const ur = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0] || {};

    // Scope bo'yicha guruhlash
    let groupCols, selCols, fameWhere;
    if (scope === "regions") {
      groupCols = "region"; selCols = "region";
      fameWhere = "region IS NOT NULL AND region <> ''";
    } else if (scope === "districts") {
      groupCols = "region, district"; selCols = "region, district";
      fameWhere = "region IS NOT NULL AND region <> '' AND district IS NOT NULL AND district <> ''";
    } else {
      groupCols = "region, district, school"; selCols = "region, district, school";
      fameWhere = "region IS NOT NULL AND region <> '' AND school IS NOT NULL AND school <> ''";
    }
    const keyOf = (r) => {
      if (scope === "regions") return r.region || "";
      if (scope === "districts") return (r.region || "") + "||" + (r.district || "");
      return (r.region || "") + "||" + (r.district || "") + "||" + (r.school || "");
    };

    // Geografik filtr (within) — maktabni o'z tumani/viloyati/davlat ichida
    const fameParams = [];
    let geoSql = "";
    if (within !== "country" && me.region) {
      fameParams.push(me.region); geoSql += ` AND region = $${fameParams.length}`;
    }
    if (within === "district" && me.district) {
      fameParams.push(me.district); geoSql += ` AND district = $${fameParams.length}`;
    }

    // FAME — o'rtacha rating (joriy)
    const fameRes = await pool.query(
      `SELECT ${selCols}, ROUND(AVG(rating))::int AS avg_rating, COUNT(*)::int AS player_count
       FROM users WHERE ${fameWhere}${geoSql} GROUP BY ${groupCols}`,
      fameParams
    );

    // EFFORT — davr bo'yicha jang ochkosi
    const effConds = []; const effParams = [];
    if (period === "week") effConds.push("created_at >= date_trunc('week', NOW())");
    else if (period === "month") effConds.push("created_at >= date_trunc('month', NOW())");
    else if (period === "season") { effConds.push("season = $1"); effParams.push(currentSeason()); }
    // Geografik filtr (within) — effort ham o'sha tuman/viloyat ichida
    if (within !== "country" && me.region) {
      effParams.push(me.region); effConds.push(`region = $${effParams.length}`);
    }
    if (within === "district" && me.district) {
      effParams.push(me.district); effConds.push(`district = $${effParams.length}`);
    }
    const effWhere = effConds.length ? "WHERE " + effConds.join(" AND ") : "";
    const effRes = await pool.query(
      `SELECT ${selCols}, COALESCE(SUM(points),0)::int AS effort_points, COUNT(DISTINCT user_id)::int AS active_students
       FROM school_battle_points ${effWhere} GROUP BY ${groupCols}`,
      effParams
    );
    const effMap = {};
    effRes.rows.forEach((r) => { effMap[keyOf(r)] = r; });

    // FORMULA — teng vazn (Fame 1500 / Effort 1500)
    const FAME_W = 1500, EFFORT_W = 1500, FAME_MIN = 800, FAME_MAX = 2000, EFFORT_K = 1500;
    const fameScore = (avg) => Math.max(0, Math.min(1, (avg - FAME_MIN) / (FAME_MAX - FAME_MIN))) * FAME_W;
    const effortScore = (pts) => EFFORT_W * pts / (pts + EFFORT_K);

    let rows = fameRes.rows.map((f) => {
      const eff = effMap[keyOf(f)] || {};
      const effort_points = eff.effort_points || 0;
      const fame_score = Math.round(fameScore(f.avg_rating));
      const effort_score = Math.round(effortScore(effort_points));
      return {
        region: f.region, district: f.district || null, school: f.school || null,
        avg_rating: f.avg_rating, player_count: f.player_count,
        effort_points, active_students: eff.active_students || 0,
        fame_score, effort_score, school_rating: fame_score + effort_score,
      };
    });
    rows.sort((a, b) => b.school_rating - a.school_rating || b.effort_points - a.effort_points || b.avg_rating - a.avg_rating);
    rows.forEach((r, i) => { r.rank = i + 1; });

    const mineKey = (scope === "regions") ? (me.region || "")
      : (scope === "districts") ? (me.region || "") + "||" + (me.district || "")
      : (me.region || "") + "||" + (me.district || "") + "||" + (me.school || "");
    let myEntry = null;
    rows.forEach((r) => {
      r.is_mine = (keyOf(r) === mineKey) && (scope !== "schools" || !!me.school) && (scope !== "districts" || !!me.district) && (scope !== "regions" || !!me.region);
      if (r.is_mine) myEntry = r;
    });

    res.json({ scope, period, within, season: currentSeason(), count: rows.length, total: rows.length, rankings: rows.slice(0, 100), my_entry: myEntry });
  } catch (err) {
    console.error("Combined rankings xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

app.get("/leaderboard", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const scope = ["global", "national", "region", "district", "school", "friends"].includes(req.query.scope) ? req.query.scope : "global";
    const period = ["all", "week", "month", "season"].includes(req.query.period) ? req.query.period : "all";

    const ur = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0] || {};

    // Qamrov filtri
    let where = "";
    const params = [];
    if (scope === "region") { params.push(me.region); where = "WHERE u.region = $1"; }
    else if (scope === "district") { params.push(me.region, me.district); where = "WHERE u.region = $1 AND u.district = $2"; }
    else if (scope === "school") { params.push(me.region, me.district, me.school); where = "WHERE u.region = $1 AND u.district = $2 AND u.school = $3"; }
    else if (scope === "friends") {
      const fr = await pool.query(
        `SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
         FROM friendships WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
        [userId]
      );
      const ids = fr.rows.map(r => r.fid); ids.push(userId);
      params.push(ids); where = "WHERE u.id = ANY($1)";
    }

    let allRows;
    if (period === "all") {
      const result = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.xp, u.profile_picture,
                u.region, u.district, u.school, u.village, u.country,
                COUNT(bh.id) FILTER (WHERE bh.outcome = 'win') AS wins,
                COUNT(bh.id) AS total_battles
         FROM users u
         LEFT JOIN battle_history bh ON bh.user_id = u.id
         ${where}
         GROUP BY u.id
         ORDER BY u.rating DESC, u.xp DESC`,
        params
      );
      allRows = result.rows.map((p) => {
        const total = parseInt(p.total_battles), wins = parseInt(p.wins);
        return {
          id: p.id, first_name: p.first_name, last_name: p.last_name, cefr_level: p.cefr_level,
          rating: p.rating, profile_picture: p.profile_picture,
          region: p.region, district: p.district, school: p.school, village: p.village, country: p.country,
          wins: wins, win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
        };
      });
    } else {
      const startSql = period === "week" ? "date_trunc('week', NOW())" : (period === "month" ? "date_trunc('month', NOW())" : "date_trunc('quarter', NOW())");
      const result = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture,
                u.region, u.district, u.school, u.village, u.country,
                COALESCE(SUM(bh.rating_change), 0)::int AS period_gain,
                COUNT(bh.id) FILTER (WHERE bh.outcome = 'win')::int AS period_wins,
                COUNT(bh.id)::int AS period_battles
         FROM users u
         JOIN battle_history bh ON bh.user_id = u.id AND bh.played_at >= ${startSql}
         ${where}
         GROUP BY u.id
         ORDER BY period_gain DESC, period_wins DESC`,
        params
      );
      allRows = result.rows.map((p) => ({
        id: p.id, first_name: p.first_name, last_name: p.last_name, cefr_level: p.cefr_level,
        rating: p.rating, profile_picture: p.profile_picture,
        region: p.region, district: p.district, school: p.school, village: p.village, country: p.country,
        period_gain: p.period_gain, wins: p.period_wins,
        win_rate: p.period_battles > 0 ? Math.round((p.period_wins / p.period_battles) * 100) : 0,
      }));
    }

    const myIndex = allRows.findIndex(p => p.id === userId);
    const my_rank = myIndex >= 0 ? myIndex + 1 : null;
    allRows.forEach((p, i) => { p.rank = i + 1; });
    const players = allRows.slice(0, 50);
    const my_entry = (myIndex >= 50) ? allRows[myIndex] : null;

    res.json({ scope, period, players, my_rank, my_entry, total_players: allRows.length });
  } catch (err) {
    console.error("Leaderboard xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// O'quvchining har qamrovdagi o'rni (Your Rankings kartasi uchun)
app.get("/leaderboard/my-ranks", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const ur = await pool.query("SELECT region, district, school, rating FROM users WHERE id = $1", [userId]);
    const me = ur.rows[0];
    if (!me) return res.json({});
    const myRating = me.rating || 1000;

    async function rankIn(cond, prms) {
      const q = await pool.query(
        `SELECT COUNT(*) + 1 AS rank FROM users WHERE rating > $1${cond ? " AND " + cond : ""}`,
        [myRating, ...prms]
      );
      return parseInt(q.rows[0].rank);
    }
    async function totIn(cond, prms) {
      const q = await pool.query(`SELECT COUNT(*) AS c FROM users${cond ? " WHERE " + cond : ""}`, prms);
      return parseInt(q.rows[0].c);
    }

    const fr = await pool.query(
      `SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
       FROM friendships WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
      [userId]
    );
    const fids = fr.rows.map(r => r.fid); fids.push(userId);
    const frRankQ = await pool.query(
      `SELECT COUNT(*) + 1 AS rank FROM users WHERE id = ANY($2) AND rating > $1`,
      [myRating, fids]
    );

    res.json({
      rating: myRating,
      global: await rankIn("", []),
      national: await rankIn("", []),
      region: me.region ? await rankIn("region = $2", [me.region]) : null,
      district: (me.region && me.district) ? await rankIn("region = $2 AND district = $3", [me.region, me.district]) : null,
      school: (me.region && me.district && me.school) ? await rankIn("region = $2 AND district = $3 AND school = $4", [me.region, me.district, me.school]) : null,
      friends: parseInt(frRankQ.rows[0].rank),
      total_global: await totIn("", []),
      total_region: me.region ? await totIn("region = $1", [me.region]) : 0,
      total_district: (me.region && me.district) ? await totIn("region = $1 AND district = $2", [me.region, me.district]) : 0,
      total_school: (me.region && me.district && me.school) ? await totIn("region = $1 AND district = $2 AND school = $3", [me.region, me.district, me.school]) : 0,
      total_friends: fids.length,
    });
  } catch (err) {
    console.error("My-ranks xato:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ ADMIN PANEL ============

// Admin parolni tekshirish (yordamchi)
// AVVAL bazadagi hashlangan parolni tekshiradi (admin o'zgartirgan bo'lsa).
// Agar bazada parol yo'q bo'lsa — eski usul (_env). Shunda login hech qachon buzilmaydi.
async function checkAdminPassword(password) {
  if (!password) return false;
  try {
    var result = await pool.query("SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_password_hash'");
    if (result.rows.length > 0 && result.rows[0].setting_value) {
      // Bazada hashlangan parol bor — bcrypt bilan solishtiramiz
      return await bcrypt.compare(password, result.rows[0].setting_value);
    }
  } catch (err) {
    console.error("Admin parol tekshirish (baza) xatosi:", err.message);
  }
  // Bazada yo'q — eski usul (_env)
  return password === process.env.ADMIN_PASSWORD;
}

// ===== AUDIT LOG HELPER =====
// Admin amallarini audit_logs jadvaliga yozadi (kim, nima, qachon)
async function logAudit(req, action, opts) {
  opts = opts || {};
  try {
    var adminName = (req.admin && req.admin.name) ? req.admin.name : "Admin";
    var ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    await pool.query(
      `INSERT INTO audit_logs (admin_name, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminName, action, opts.entityType || null, opts.entityId ? String(opts.entityId) : null, opts.details || null, String(ip).slice(0, 60)]
    );
  } catch (err) {
    console.error("Audit log xatosi:", err.message); // audit xatosi asosiy amalni to'xtatmaydi
  }
}

// ===== ADMIN LOGIN RATE LIMIT (in-memory, tashqi paketsiz) =====
// Brute-force himoyasi: bir IP'dan ketma-ket noto'g'ri urinishlarni cheklaydi
var _adminLoginAttempts = {}; // { ip: { count, firstAt, blockedUntil } }
function adminLoginRateLimit(req, res, next) {
  var ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  var now = Date.now();
  var rec = _adminLoginAttempts[ip];

  // Blok muddati o'tgan bo'lsa — tozalaymiz
  if (rec && rec.blockedUntil && now > rec.blockedUntil) { delete _adminLoginAttempts[ip]; rec = null; }

  // Bloklangan bo'lsa — rad etamiz
  if (rec && rec.blockedUntil && now <= rec.blockedUntil) {
    var waitMin = Math.ceil((rec.blockedUntil - now) / 60000);
    return res.status(429).json({ error: "Juda ko'p urinish. " + waitMin + " daqiqadan keyin qayta urinib ko'ring." });
  }
  next();
}

// Noto'g'ri urinishni qayd qilish
function recordFailedLogin(req) {
  var ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  var now = Date.now();
  if (!_adminLoginAttempts[ip]) _adminLoginAttempts[ip] = { count: 0, firstAt: now };
  _adminLoginAttempts[ip].count++;
  // 5 ta noto'g'ri urinishdan keyin — 15 daqiqa blok
  if (_adminLoginAttempts[ip].count >= 5) {
    _adminLoginAttempts[ip].blockedUntil = now + 15 * 60 * 1000;
  }
}
function clearLoginAttempts(req) {
  var ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  delete _adminLoginAttempts[ip];
}

// ===== ADMIN AUTH ENDPOINTLAR =====

// Admin login — parolni tekshiradi, token beradi
app.post("/admin/login", adminLoginRateLimit, async (req, res) => {
  try {
    const { password } = req.body;
    var passOk = await checkAdminPassword(password);
    if (!passOk) {
      recordFailedLogin(req);
      // Noto'g'ri login urinishini audit'ga yozamiz
      await logAudit(req, "admin_login_failed", { details: "Noto'g'ri parol urinishi" });
      return res.status(401).json({ error: "Noto'g'ri parol" });
    }
    clearLoginAttempts(req); // muvaffaqiyatli — urinishlarni tozalaymiz
    const token = signAdminToken("Admin");
    // req.admin'ni qo'lda o'rnatamiz (logAudit uchun)
    req.admin = { name: "Admin" };
    await logAudit(req, "admin_login_success", { details: "Admin tizimga kirdi" });
    res.json({ token: token, admin: { name: "Admin", role: "super_admin" } });
  } catch (err) {
    console.error("Admin login xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Admin token tekshirish — sahifa qayta yuklanganda token hali amal qiladimi
app.get("/admin/me", requireAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

// Admin logout — token frontend'da o'chiriladi, bu yerda faqat audit
app.post("/admin/logout", requireAdmin, async (req, res) => {
  await logAudit(req, "admin_logout", { details: "Admin tizimdan chiqdi" });
  res.json({ message: "Chiqildi" });
});

// Admin parolini o'zgartirish (eski parolni tasdiqlash bilan)
app.post("/admin/settings/password", requireAdmin, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Joriy va yangi parol kerak" });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: "Yangi parol kamida 6 belgi bo'lishi kerak" });
    }

    // Joriy parolni tekshiramiz (xavfsizlik — eski parolni bilmasangiz o'zgartira olmaysiz)
    var currentOk = await checkAdminPassword(current_password);
    if (!currentOk) {
      await logAudit(req, "admin_password_change_failed", { details: "Joriy parol noto'g'ri" });
      return res.status(401).json({ error: "Joriy parol noto'g'ri" });
    }

    // Yangi parolni hashlash va bazaga saqlash (UPSERT)
    var hashed = await bcrypt.hash(new_password, 10);
    await pool.query(
      `INSERT INTO admin_settings (setting_key, setting_value, updated_at)
       VALUES ('admin_password_hash', $1, NOW())
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = NOW()`,
      [hashed]
    );

    await logAudit(req, "admin_password_changed", { details: "Admin parol o'zgartirildi" });
    res.json({ message: "Parol muvaffaqiyatli o'zgartirildi" });
  } catch (err) {
    console.error("Parol o'zgartirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Tizim ma'lumotlari (Settings sahifasi uchun)
app.get("/admin/settings/info", requireAdmin, async (req, res) => {
  try {
    // Parol manbai: bazadami yoki _env (eski)?
    var pwResult = await pool.query("SELECT updated_at FROM admin_settings WHERE setting_key = 'admin_password_hash'");
    var passwordSource = pwResult.rows.length > 0 ? "database" : "env";
    var passwordUpdated = pwResult.rows.length > 0 ? pwResult.rows[0].updated_at : null;

    // Umumiy sonlar
    var counts = await Promise.all([
      pool.query("SELECT COUNT(*) AS c FROM users"),
      pool.query("SELECT COUNT(*) AS c FROM questions"),
      pool.query("SELECT COUNT(*) AS c FROM audit_logs"),
    ]);

    res.json({
      passwordSource: passwordSource,
      passwordUpdated: passwordUpdated,
      totalUsers: parseInt(counts[0].rows[0].c),
      totalQuestions: parseInt(counts[1].rows[0].c),
      totalAuditLogs: parseInt(counts[2].rows[0].c),
    });
  } catch (err) {
    console.error("Settings info xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ MODERATSIYA (SHIKOYAT / FLAG) ============

// O'quvchi shikoyat yuboradi (savol yoki foydalanuvchi ustidan)
app.post("/flags/report", authMiddleware, async (req, res) => {
  try {
    const reporterId = req.user.id;
    const { entity_type, entity_id, reason, comment } = req.body;

    // Validatsiya
    if (!entity_type || !entity_id || !reason) {
      return res.status(400).json({ error: "Ma'lumot yetishmaydi" });
    }
    var validTypes = ["question", "user"];
    if (validTypes.indexOf(entity_type) === -1) {
      return res.status(400).json({ error: "Noto'g'ri tur" });
    }
    var validReasons = ["incorrect", "inappropriate", "spam", "offensive", "cheating", "other"];
    if (validReasons.indexOf(reason) === -1) {
      return res.status(400).json({ error: "Noto'g'ri sabab" });
    }
    // O'ziga shikoyat qila olmaydi
    if (entity_type === "user" && parseInt(entity_id) === reporterId) {
      return res.status(400).json({ error: "O'zingizga shikoyat qila olmaysiz" });
    }

    // Anti-abuse: bir foydalanuvchi bir narsaga faqat bir marta shikoyat qila oladi
    var existing = await pool.query(
      "SELECT id FROM flags WHERE reporter_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'pending'",
      [reporterId, entity_type, parseInt(entity_id)]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Siz bu haqda allaqachon shikoyat qilgansiz" });
    }

    var contextRoom = (req.body.context_room_id || "").trim().slice(0, 120) || null;
    await pool.query(
      "INSERT INTO flags (reporter_id, entity_type, entity_id, reason, comment, context_room_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [reporterId, entity_type, parseInt(entity_id), reason, (comment || "").trim().slice(0, 500) || null, contextRoom]
    );

    res.json({ message: "Shikoyat yuborildi. Rahmat!" });
  } catch (err) {
    console.error("Shikoyat xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Admin: shikoyatlar ro'yxati (pagination, status filtr)
app.get("/admin/flags", requireAdmin, async (req, res) => {
  try {
    var page = Math.max(1, parseInt(req.query.page) || 1);
    var limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    var offset = (page - 1) * limit;
    var status = (req.query.status || "pending").trim();

    var conds = []; var params = []; var p = 0;
    if (status && status !== "all") { p++; conds.push("f.status = $" + p); params.push(status); }
    var whereClause = conds.length ? "WHERE " + conds.join(" AND ") : "";

    var countResult = await pool.query("SELECT COUNT(*) AS total FROM flags f " + whereClause, params);
    var total = parseInt(countResult.rows[0].total);

    var dataParams = params.slice();
    dataParams.push(limit); var li = dataParams.length;
    dataParams.push(offset); var oi = dataParams.length;

    // Shikoyat + shikoyatchi ismi + (savol bo'lsa) savol matni
    var dataResult = await pool.query(
      "SELECT f.id, f.entity_type, f.entity_id, f.reason, f.comment, f.status, " +
      "f.reviewed_by, f.reviewed_at, f.created_at, f.reporter_id, f.context_room_id, " +
      "r.first_name AS reporter_first, r.last_name AS reporter_last, " +
      "q.question_text AS question_text, " +
      "tu.first_name AS target_first, tu.last_name AS target_last " +
      "FROM flags f " +
      "LEFT JOIN users r ON r.id = f.reporter_id " +
      "LEFT JOIN questions q ON (f.entity_type = 'question' AND q.id = f.entity_id) " +
      "LEFT JOIN users tu ON (f.entity_type = 'user' AND tu.id = f.entity_id) " +
      whereClause + " ORDER BY f.created_at DESC LIMIT $" + li + " OFFSET $" + oi,
      dataParams
    );

    res.json({
      flags: dataResult.rows,
      pagination: { page: page, limit: limit, total: total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Flags ro'yxat xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Admin: shikoyatni hal qilish (resolved yoki dismissed)
app.post("/admin/flags/resolve", requireAdmin, async (req, res) => {
  try {
    const { id, action } = req.body; // action: 'resolve' yoki 'dismiss'
    if (!id || !action) return res.status(400).json({ error: "id va action kerak" });

    var newStatus = action === "resolve" ? "resolved" : "dismissed";
    var adminName = (req.admin && req.admin.name) ? req.admin.name : "Admin";

    var result = await pool.query(
      "UPDATE flags SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3 RETURNING entity_type, entity_id",
      [newStatus, adminName, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Shikoyat topilmadi" });

    var f = result.rows[0];
    await logAudit(req, "flag_" + newStatus, { entityType: f.entity_type, entityId: f.entity_id, details: "Shikoyat " + (newStatus === "resolved" ? "tasdiqlandi" : "rad etildi") });
    res.json({ message: newStatus === "resolved" ? "Shikoyat hal qilindi" : "Shikoyat rad etildi" });
  } catch (err) {
    console.error("Flag resolve xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Admin: kutilayotgan shikoyatlar soni (sidebar badge uchun)
app.get("/admin/flags/count", requireAdmin, async (req, res) => {
  try {
    var result = await pool.query("SELECT COUNT(*) AS c FROM flags WHERE status = 'pending'");
    res.json({ pending: parseInt(result.rows[0].c) });
  } catch (err) {
    res.json({ pending: 0 });
  }
});

// Admin: foydalanuvchining so'nggi chat xabarlari (moderatsiya uchun)
app.get("/admin/users/:id/messages", requireAdmin, async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Noto'g'ri ID" });

    var result = await pool.query(
      "SELECT message, room_id, created_at FROM chat_messages WHERE sender_id = $1 ORDER BY created_at DESC LIMIT 50",
      [id]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error("Foydalanuvchi xabarlari xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Admin: bitta jang (room) suhbati — ikkala o'yinchi xabarlari (moderatsiya)
app.get("/admin/room-messages", requireAdmin, async (req, res) => {
  try {
    var roomId = (req.query.room || "").trim();
    if (!roomId) return res.status(400).json({ error: "Room ID kerak" });

    var result = await pool.query(
      "SELECT sender_id, sender_name, message, created_at FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 200",
      [roomId]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error("Room xabarlari xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== ADMIN: HISOBOTLAR (REPORTS) =====
// Tahlil — vaqt oralig'i bo'yicha. Query: ?days=30 (yoki 7, 90)
app.get("/admin/reports", requireAdmin, async (req, res) => {
  try {
    var days = parseInt(req.query.days) || 30;
    if ([7, 30, 90].indexOf(days) === -1) days = 30;

    var results = await Promise.all([
      // 1. Asosiy ko'rsatkichlar (umumiy)
      pool.query("SELECT COUNT(*) AS c FROM users"),
      pool.query("SELECT COUNT(*) AS c FROM battle_history"),
      pool.query("SELECT COUNT(*) AS c FROM questions"),
      pool.query("SELECT COUNT(*) AS c FROM flags WHERE status = 'pending'"),
      // 2. Tanlangan davrdagi yangi foydalanuvchilar
      pool.query("SELECT COUNT(*) AS c FROM users WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval", [days - 1]),
      // 3. Tanlangan davrdagi janglar
      pool.query("SELECT COUNT(*) AS c FROM battle_history WHERE played_at >= CURRENT_DATE - ($1 || ' days')::interval", [days - 1]),
      // 4. Foydalanuvchi o'sishi (kunlik, tanlangan davr)
      pool.query("SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM users WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval GROUP BY day ORDER BY day", [days - 1]),
      // 5. Jang faolligi (kunlik, tanlangan davr)
      pool.query("SELECT TO_CHAR(played_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM battle_history WHERE played_at >= CURRENT_DATE - ($1 || ' days')::interval GROUP BY day ORDER BY day", [days - 1]),
      // 6. Daraja taqsimoti (barcha o'quvchilar)
      pool.query("SELECT cefr_level, COUNT(*) AS c FROM users WHERE role = 'student' OR role IS NULL GROUP BY cefr_level"),
      // 7. Eng faol viloyatlar (top 6)
      pool.query("SELECT region, COUNT(*) AS c FROM users WHERE region IS NOT NULL AND region != '' GROUP BY region ORDER BY c DESC LIMIT 6"),
      // 8. Eng faol maktablar (top 6, o'quvchi soni bo'yicha)
      pool.query("SELECT school, region, COUNT(*) AS c FROM users WHERE school IS NOT NULL AND school != '' GROUP BY school, region ORDER BY c DESC LIMIT 6"),
    ]);

    res.json({
      days: days,
      totals: {
        users: parseInt(results[0].rows[0].c),
        battles: parseInt(results[1].rows[0].c),
        questions: parseInt(results[2].rows[0].c),
        pendingFlags: parseInt(results[3].rows[0].c),
        newUsers: parseInt(results[4].rows[0].c),
        periodBattles: parseInt(results[5].rows[0].c),
      },
      userGrowth: results[6].rows.map(function (r) { return { day: r.day, count: parseInt(r.c) }; }),
      battleActivity: results[7].rows.map(function (r) { return { day: r.day, count: parseInt(r.c) }; }),
      levelDistribution: results[8].rows.map(function (r) { return { level: r.cefr_level || "A1", count: parseInt(r.c) }; }),
      topRegions: results[9].rows.map(function (r) { return { name: r.region, count: parseInt(r.c) }; }),
      topSchools: results[10].rows.map(function (r) { return { name: r.school, region: r.region || "—", count: parseInt(r.c) }; }),
    });
  } catch (err) {
    console.error("Hisobotlar xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ============ PRACTICE (YAKKA MASHQ) ============

// Practice savollarini olish (token bilan, daraja + son tanlanadi)
app.get("/practice/start", authMiddleware, async (req, res) => {
  try {
    var level = (req.query.level || req.user.cefr_level || "A1").trim();
    var count = parseInt(req.query.count) || 10;
    if (count < 5) count = 5;
    if (count > 30) count = 30;

    var validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    if (validLevels.indexOf(level) === -1) level = "A1";

    // Savollarni olamiz (to'g'ri javob bilan — practice'da darhol ko'rsatamiz)
    var result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, skill
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2`,
      [level, count]
    );

    // Yetarli savol bo'lmasa — har qanday darajadan to'ldiramiz
    if (result.rows.length < count) {
      var extra = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, skill
         FROM questions WHERE cefr_level != $1 ORDER BY RANDOM() LIMIT $2`,
        [level, count - result.rows.length]
      );
      result.rows = result.rows.concat(extra.rows);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Hozircha savollar mavjud emas" });
    }

    res.json({ level: level, total: result.rows.length, questions: result.rows });
  } catch (err) {
    console.error("Practice start xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Practice yakunlash — XP berish (reyting YO'Q, faqat XP)
app.post("/practice/finish", authMiddleware, async (req, res) => {
  try {
    var userId = req.user.id;
    var correct = parseInt(req.body.correct) || 0;
    var total = parseInt(req.body.total) || 0;

    if (total <= 0 || correct < 0 || correct > total) {
      return res.status(400).json({ error: "Noto'g'ri natija" });
    }

    // Practice XP: har to'g'ri javob uchun 2 XP (rankedّdan kam — bu mashq)
    var xpEarned = correct * 2;

    var updated = await pool.query(
      "UPDATE users SET xp = xp + $1 WHERE id = $2 RETURNING id, xp, cefr_level, rating",
      [xpEarned, userId]
    );

    // Topshiriq progressini ham yangilaymiz (practice ham "javob berish" hisoblanadi)
    await updateQuestProgress(userId, { won: false, correctAnswers: correct, xpEarned: xpEarned });

    res.json({
      xp_earned: xpEarned,
      correct: correct,
      total: total,
      updated_user: updated.rows[0],
    });
  } catch (err) {
    console.error("Practice finish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Savollarni olish (admin) — pagination, search, filter bilan
// GET, token bilan (parol emas). Query: ?page=1&limit=25&search=&level=&skill=&status=&date_from=&date_to=
app.get("/admin/questions", requireAdmin, async (req, res) => {
  try {
    var page = Math.max(1, parseInt(req.query.page) || 1);
    var limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    var offset = (page - 1) * limit;

    var search = (req.query.search || "").trim();
    var level = (req.query.level || "").trim();
    var skill = (req.query.skill || "").trim();
    var status = (req.query.status || "").trim();
    var dateFrom = (req.query.date_from || "").trim();
    var dateTo = (req.query.date_to || "").trim();

    // WHERE shartlarni dinamik quramiz (SQL injection'dan himoya: parametrlar $1, $2...)
    var conds = [];
    var params = [];
    var p = 0;

    if (search) {
      p++; conds.push("(LOWER(question_text) LIKE $" + p + " OR CAST(id AS TEXT) LIKE $" + p + ")");
      params.push("%" + search.toLowerCase() + "%");
    }
    if (level) { p++; conds.push("cefr_level = $" + p); params.push(level); }
    if (skill) { p++; conds.push("skill = $" + p); params.push(skill); }
    if (status) { p++; conds.push("status = $" + p); params.push(status); }
    if (dateFrom) { p++; conds.push("created_at >= $" + p); params.push(dateFrom); }
    if (dateTo) { p++; conds.push("created_at <= $" + p); params.push(dateTo + " 23:59:59"); }

    var whereClause = conds.length ? "WHERE " + conds.join(" AND ") : "";

    // Jami sonni olamiz (pagination uchun)
    var countResult = await pool.query("SELECT COUNT(*) AS total FROM questions " + whereClause, params);
    var total = parseInt(countResult.rows[0].total);

    // Sahifa ma'lumotini olamiz (limit + offset)
    var dataParams = params.slice();
    dataParams.push(limit); var limitIdx = dataParams.length;
    dataParams.push(offset); var offsetIdx = dataParams.length;

    var dataResult = await pool.query(
      "SELECT id, question_text, option_a, option_b, option_c, option_d, " +
      "correct_option, cefr_level, skill, difficulty, explanation, status, created_at, updated_at " +
      "FROM questions " + whereClause +
      " ORDER BY id DESC LIMIT $" + limitIdx + " OFFSET $" + offsetIdx,
      dataParams
    );

    res.json({
      questions: dataResult.rows,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Admin savollar xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Yangi savol qo'shish
app.post("/admin/questions/add", requireAdmin, async (req, res) => {
  try {
    const { question_text, option_a, option_b, option_c, option_d,
            correct_option, cefr_level, skill, explanation, status } = req.body;

    // Tekshirish
    if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
      return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
    }
    if (!["A", "B", "C", "D"].includes(correct_option)) {
      return res.status(400).json({ error: "To'g'ri javob A, B, C yoki D bo'lishi kerak" });
    }
    // Status validatsiyasi
    var st = status || "published";
    if (!["published", "draft", "needs_review"].includes(st)) st = "published";

    const result = await pool.query(
      `INSERT INTO questions
       (question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, difficulty, explanation, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'easy', $9, $10)
       RETURNING id`,
      [question_text, option_a, option_b, option_c, option_d, correct_option,
       cefr_level || "A1", skill || "grammar", explanation || "", st]
    );

    var newId = result.rows[0].id;
    await logAudit(req, "question_created", { entityType: "question", entityId: newId, details: (cefr_level || "A1") + " · " + (skill || "grammar") });

    res.json({ message: "Savol qo'shildi!", id: newId });
  } catch (err) {
    console.error("Savol qo'shish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Savolni o'chirish
app.post("/admin/questions/delete", requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Savol ID kerak" });

    await pool.query("DELETE FROM questions WHERE id = $1", [id]);
    await logAudit(req, "question_deleted", { entityType: "question", entityId: id });
    res.json({ message: "Savol o'chirildi!" });
  } catch (err) {
    console.error("Savol o'chirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Savolni tahrirlash (Edit)
app.post("/admin/questions/edit", requireAdmin, async (req, res) => {
  try {
    const { id, question_text, option_a, option_b, option_c, option_d,
            correct_option, cefr_level, skill, explanation, status } = req.body;

    if (!id) return res.status(400).json({ error: "Savol ID kerak" });
    if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
      return res.status(400).json({ error: "Barcha maydonlarni to'ldiring" });
    }
    if (!["A", "B", "C", "D"].includes(correct_option)) {
      return res.status(400).json({ error: "To'g'ri javob A, B, C yoki D bo'lishi kerak" });
    }
    var st = status || "published";
    if (!["published", "draft", "needs_review"].includes(st)) st = "published";

    const result = await pool.query(
      `UPDATE questions SET
         question_text = $1, option_a = $2, option_b = $3, option_c = $4, option_d = $5,
         correct_option = $6, cefr_level = $7, skill = $8, explanation = $9, status = $10,
         updated_at = NOW()
       WHERE id = $11 RETURNING id`,
      [question_text, option_a, option_b, option_c, option_d, correct_option,
       cefr_level || "A1", skill || "grammar", explanation || "", st, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Savol topilmadi" });

    await logAudit(req, "question_updated", { entityType: "question", entityId: id, details: (cefr_level || "A1") + " · " + (skill || "grammar") });
    res.json({ message: "Savol yangilandi!", id: id });
  } catch (err) {
    console.error("Savol tahrirlash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== QUESTION DISTRIBUTION (real statistika) =====
// Daraja, ko'nikma, status bo'yicha savol taqsimoti — hammasi bazadan
app.get("/admin/questions/stats", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT cefr_level, skill, status FROM questions"
    );
    const rows = result.rows;

    var levels = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
    var skills = {};
    var status = { published: 0, draft: 0, needs_review: 0 };

    rows.forEach(function (q) {
      // Daraja
      if (levels[q.cefr_level] != null) levels[q.cefr_level]++;
      // Ko'nikma
      var sk = q.skill || "grammar";
      skills[sk] = (skills[sk] || 0) + 1;
      // Status
      var st = q.status || "published";
      if (status[st] != null) status[st]++;
    });

    // Eng ko'p / eng kam daraja
    var mostLevel = null, leastLevel = null, maxC = -1, minC = Infinity;
    Object.keys(levels).forEach(function (lv) {
      if (levels[lv] > maxC) { maxC = levels[lv]; mostLevel = lv; }
      if (levels[lv] < minC) { minC = levels[lv]; leastLevel = lv; }
    });
    // Eng ko'p ko'nikma
    var mostSkill = null, maxSk = -1;
    Object.keys(skills).forEach(function (sk) {
      if (skills[sk] > maxSk) { maxSk = skills[sk]; mostSkill = sk; }
    });

    res.json({
      totalQuestions: rows.length,
      levels: levels,
      skills: skills,
      status: status,
      mostCommonLevel: mostLevel,
      leastCoveredLevel: leastLevel,
      mostCommonSkill: mostSkill,
    });
  } catch (err) {
    console.error("Stats xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== QUESTION HEALTH (real validatsiya formulasi) =====
// Validation Score = valid savollar / jami × 100. Hammasi bazadan hisoblanadi.
app.get("/admin/questions/health", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d,
              correct_option, cefr_level, skill, status FROM questions`
    );
    const rows = result.rows;

    var total = rows.length;
    var valid = 0, missingFields = 0, invalidAnswerKey = 0;
    var published = 0, draft = 0, needsReview = 0;
    var validStatuses = ["published", "draft", "needs_review"];
    var validAnswers = ["A", "B", "C", "D"];

    // Duplicate aniqlash: normalized (lowercase, trim) matn bo'yicha
    var seen = {};
    var duplicateRisk = 0;

    rows.forEach(function (q) {
      // Status sanog'i
      var st = q.status || "published";
      if (st === "published") published++;
      else if (st === "draft") draft++;
      else if (st === "needs_review") needsReview++;

      // Maydon to'liqligini tekshirish
      var hasAllFields =
        q.question_text && q.question_text.trim().length >= 3 &&
        q.option_a && q.option_a.trim() &&
        q.option_b && q.option_b.trim() &&
        q.option_c && q.option_c.trim() &&
        q.option_d && q.option_d.trim() &&
        q.cefr_level && q.skill;

      var answerOk = validAnswers.indexOf(q.correct_option) > -1;
      var statusOk = validStatuses.indexOf(st) > -1;

      if (!hasAllFields) missingFields++;
      if (!answerOk) invalidAnswerKey++;

      // Duplicate tekshiruvi
      var norm = (q.question_text || "").toLowerCase().trim().replace(/\s+/g, " ");
      if (norm) {
        if (seen[norm]) duplicateRisk++;
        else seen[norm] = true;
      }

      // Valid: hamma shart bajarilsa
      if (hasAllFields && answerOk && statusOk) valid++;
    });

    var score = total > 0 ? Math.round((valid / total) * 1000) / 10 : 0;

    res.json({
      totalQuestions: total,
      validQuestions: valid,
      validationScore: score,
      missingFields: missingFields,
      invalidAnswerKey: invalidAnswerKey,
      duplicateRisk: duplicateRisk,
      needsReview: needsReview,
      published: published,
      draft: draft,
    });
  } catch (err) {
    console.error("Health xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== AUDIT LOGS RO'YXATI (Recent Admin Activity) =====
app.get("/admin/audit-logs", requireAdmin, async (req, res) => {
  try {
    var page = Math.max(1, parseInt(req.query.page) || 1);
    var limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    var offset = (page - 1) * limit;

    var action = (req.query.action || "").trim();
    var conds = []; var params = []; var p = 0;
    if (action) { p++; conds.push("action = $" + p); params.push(action); }
    var whereClause = conds.length ? "WHERE " + conds.join(" AND ") : "";

    var countResult = await pool.query("SELECT COUNT(*) AS total FROM audit_logs " + whereClause, params);
    var total = parseInt(countResult.rows[0].total);

    var dataParams = params.slice();
    dataParams.push(limit); var li = dataParams.length;
    dataParams.push(offset); var oi = dataParams.length;

    var dataResult = await pool.query(
      "SELECT id, admin_name, action, entity_type, entity_id, details, created_at FROM audit_logs " +
      whereClause + " ORDER BY id DESC LIMIT $" + li + " OFFSET $" + oi,
      dataParams
    );

    res.json({
      logs: dataResult.rows,
      pagination: { page: page, limit: limit, total: total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Audit logs xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== ADMIN OVERVIEW (umumiy dashboard statistikasi) =====
// Jami savol, foydalanuvchi, maktab, jang — hammasi bazadan
app.get("/admin/overview", requireAdmin, async (req, res) => {
  try {
    // Bir nechta so'rovni parallel bajaramiz (tezroq)
    var results = await Promise.all([
      pool.query("SELECT COUNT(*) AS c FROM questions"),
      pool.query("SELECT COUNT(*) AS c FROM users WHERE role = 'student'"),
      pool.query("SELECT COUNT(*) AS c FROM users WHERE role = 'teacher' OR role = 'school_admin'"),
      pool.query("SELECT COUNT(DISTINCT school) AS c FROM users WHERE school IS NOT NULL AND school != ''"),
      pool.query("SELECT COUNT(*) AS c FROM battle_history"),
      pool.query("SELECT COUNT(*) AS c FROM users WHERE last_active_date = CURRENT_DATE"),
      // Eng faol viloyatlar (top 5)
      pool.query("SELECT region, COUNT(*) AS c FROM users WHERE region IS NOT NULL AND region != '' GROUP BY region ORDER BY c DESC LIMIT 5"),
      // So'nggi 7 kun ichida qo'shilgan savollar (o'sish grafigi uchun)
      pool.query("SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM questions WHERE created_at >= CURRENT_DATE - INTERVAL '6 days' GROUP BY day ORDER BY day"),
    ]);

    res.json({
      totalQuestions: parseInt(results[0].rows[0].c),
      totalStudents: parseInt(results[1].rows[0].c),
      totalTeachers: parseInt(results[2].rows[0].c),
      totalSchools: parseInt(results[3].rows[0].c),
      totalBattles: parseInt(results[4].rows[0].c),
      activeToday: parseInt(results[5].rows[0].c),
      topRegions: results[6].rows.map(function (r) { return { name: r.region, count: parseInt(r.c) }; }),
      questionGrowth: results[7].rows.map(function (r) { return { day: r.day, count: parseInt(r.c) }; }),
    });
  } catch (err) {
    console.error("Overview xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== ADMIN: FOYDALANUVCHILAR =====
// Ro'yxat — pagination, qidiruv, filtr (rol, daraja, viloyat)
app.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    var page = Math.max(1, parseInt(req.query.page) || 1);
    var limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    var offset = (page - 1) * limit;

    var search = (req.query.search || "").trim();
    var role = (req.query.role || "").trim();
    var level = (req.query.level || "").trim();
    var region = (req.query.region || "").trim();

    var conds = []; var params = []; var p = 0;
    if (search) {
      p++; conds.push("(LOWER(first_name) LIKE $" + p + " OR LOWER(last_name) LIKE $" + p + " OR phone LIKE $" + p + ")");
      params.push("%" + search.toLowerCase() + "%");
    }
    if (role) { p++; conds.push("role = $" + p); params.push(role); }
    if (level) { p++; conds.push("cefr_level = $" + p); params.push(level); }
    if (region) { p++; conds.push("region = $" + p); params.push(region); }
    var whereClause = conds.length ? "WHERE " + conds.join(" AND ") : "";

    var countResult = await pool.query("SELECT COUNT(*) AS total FROM users " + whereClause, params);
    var total = parseInt(countResult.rows[0].total);

    var dataParams = params.slice();
    dataParams.push(limit); var li = dataParams.length;
    dataParams.push(offset); var oi = dataParams.length;

    var dataResult = await pool.query(
      "SELECT id, first_name, last_name, role, cefr_level, rating, region, district, school, " +
      "phone, is_banned, created_at FROM users " + whereClause +
      " ORDER BY id DESC LIMIT $" + li + " OFFSET $" + oi,
      dataParams
    );

    res.json({
      users: dataResult.rows,
      pagination: { page: page, limit: limit, total: total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Admin users xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Rolni o'zgartirish
app.post("/admin/users/role", requireAdmin, async (req, res) => {
  try {
    const { id, role } = req.body;
    if (!id || !role) return res.status(400).json({ error: "id va role kerak" });
    var validRoles = ["student", "teacher", "school_admin"];
    if (validRoles.indexOf(role) === -1) return res.status(400).json({ error: "Noto'g'ri rol" });

    var result = await pool.query("UPDATE users SET role = $1 WHERE id = $2 RETURNING first_name, last_name", [role, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    var name = result.rows[0].first_name + " " + result.rows[0].last_name;
    await logAudit(req, "user_role_changed", { entityType: "user", entityId: id, details: name + " → " + role });
    res.json({ message: "Rol o'zgartirildi" });
  } catch (err) {
    console.error("Rol o'zgartirish xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Ban / faolsizlantirish (toggle)
app.post("/admin/users/ban", requireAdmin, async (req, res) => {
  try {
    const { id, banned } = req.body;
    if (!id) return res.status(400).json({ error: "id kerak" });

    var result = await pool.query("UPDATE users SET is_banned = $1 WHERE id = $2 RETURNING first_name, last_name", [banned === true, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    var name = result.rows[0].first_name + " " + result.rows[0].last_name;
    await logAudit(req, banned ? "user_banned" : "user_unbanned", { entityType: "user", entityId: id, details: name });
    res.json({ message: banned ? "Foydalanuvchi bloklandi" : "Blok olib tashlandi" });
  } catch (err) {
    console.error("Ban xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Foydalanuvchi ma'lumotini tahrirlash (viloyat, tuman, maktab, daraja)
app.post("/admin/users/update", requireAdmin, async (req, res) => {
  try {
    const { id, region, district, school, cefr_level } = req.body;
    if (!id) return res.status(400).json({ error: "Foydalanuvchi ID kerak" });

    // Viloyat-tuman juftligini tekshiramiz (regions.js bilan — bir xil himoya)
    const regionCheck = validateRegionDistrict(region, district);
    if (!regionCheck.valid) {
      return res.status(400).json({ error: regionCheck.error });
    }

    // CEFR daraja validatsiyasi
    var validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    var lvl = cefr_level || "A1";
    if (validLevels.indexOf(lvl) === -1) lvl = "A1";

    var result = await pool.query(
      "UPDATE users SET region = $1, district = $2, school = $3, cefr_level = $4 WHERE id = $5 RETURNING first_name, last_name",
      [region, district, normalizeSchool(school), lvl, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    var name = result.rows[0].first_name + " " + result.rows[0].last_name;
    await logAudit(req, "user_updated", { entityType: "user", entityId: id, details: name + " — " + region + ", " + district });
    res.json({ message: "Foydalanuvchi yangilandi" });
  } catch (err) {
    console.error("Foydalanuvchi yangilash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Bitta foydalanuvchi to'liq ma'lumoti (modal uchun)
app.get("/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Noto'g'ri ID" });

    var userResult = await pool.query(
      `SELECT id, first_name, last_name, role, cefr_level, rating, xp, coins,
              current_streak, longest_streak, win_streak, best_win_streak,
              region, district, village, school, phone, birth_date,
              profile_picture, is_banned, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    // Jang soni (qo'shimcha statistika)
    var battleResult = await pool.query("SELECT COUNT(*) AS c FROM battle_history WHERE user_id = $1", [id]);
    // G'alaba soni
    var winResult = await pool.query("SELECT COUNT(*) AS c FROM battle_history WHERE user_id = $1 AND outcome = 'win'", [id]);

    var user = userResult.rows[0];
    user.total_battles = parseInt(battleResult.rows[0].c);
    user.total_wins = parseInt(winResult.rows[0].c);

    res.json({ user: user });
  } catch (err) {
    console.error("Foydalanuvchi ma'lumoti xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== ADMIN: MAKTABLAR =====
// Maktablar ro'yxati — viloyat + tuman + nom bo'yicha guruhlangan (sun'iy juftlik yo'q)
app.get("/admin/schools", requireAdmin, async (req, res) => {
  try {
    var page = Math.max(1, parseInt(req.query.page) || 1);
    var limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    var offset = (page - 1) * limit;
    var search = (req.query.search || "").trim();
    var region = (req.query.region || "").trim();

    var conds = ["school IS NOT NULL", "school != ''"];
    var params = []; var p = 0;
    if (search) { p++; conds.push("LOWER(school) LIKE $" + p); params.push("%" + search.toLowerCase() + "%"); }
    if (region) { p++; conds.push("region = $" + p); params.push(region); }
    var whereClause = "WHERE " + conds.join(" AND ");

    // MUHIM: viloyat + tuman + maktab bo'yicha guruhlaymiz (MAX emas!)
    // Shunda "Toshkent, 5-maktab" va "Namangan, 5-maktab" alohida ko'rinadi (to'g'ri)
    var countResult = await pool.query(
      "SELECT COUNT(*) AS total FROM (SELECT school, region, district FROM users " + whereClause + " GROUP BY school, region, district) AS sub", params
    );
    var total = parseInt(countResult.rows[0].total);

    var dataParams = params.slice();
    dataParams.push(limit); var li = dataParams.length;
    dataParams.push(offset); var oi = dataParams.length;

    var dataResult = await pool.query(
      "SELECT school, region, district, " +
      "COUNT(*) AS student_count, " +
      "ROUND(AVG(rating)) AS avg_rating " +
      "FROM users " + whereClause +
      " GROUP BY school, region, district ORDER BY student_count DESC LIMIT $" + li + " OFFSET $" + oi,
      dataParams
    );

    res.json({
      schools: dataResult.rows.map(function (r) {
        return {
          name: r.school,
          studentCount: parseInt(r.student_count),
          avgRating: r.avg_rating != null ? parseInt(r.avg_rating) : 0,
          region: r.region || "—",
          district: r.district || "—",
        };
      }),
      pagination: { page: page, limit: limit, total: total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Maktablar xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Bitta maktab o'quvchilari (drill-down) — nom + viloyat + tuman bo'yicha
app.get("/admin/schools/students", requireAdmin, async (req, res) => {
  try {
    var school = (req.query.school || "").trim();
    var region = (req.query.region || "").trim();
    var district = (req.query.district || "").trim();
    if (!school) return res.status(400).json({ error: "Maktab nomi kerak" });

    var conds = ["school = $1"];
    var params = [school]; var p = 1;
    if (region && region !== "—") { p++; conds.push("region = $" + p); params.push(region); }
    if (district && district !== "—") { p++; conds.push("district = $" + p); params.push(district); }

    var result = await pool.query(
      "SELECT id, first_name, last_name, role, cefr_level, rating, is_banned " +
      "FROM users WHERE " + conds.join(" AND ") + " ORDER BY rating DESC LIMIT 100",
      params
    );
    res.json({ school: school, students: result.rows });
  } catch (err) {
    console.error("Maktab o'quvchilari xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// ===== BULK IMPORT (CSV) =====
// Frontend tahlil qilingan qatorlarni yuboradi. Backend HAR qatorni QAYTA validatsiya qiladi
// (frontendga ishonmaymiz) va faqat valid qatorlarni bazaga qo'shadi.
app.post("/admin/questions/bulk-import", requireAdmin, async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Import uchun qatorlar yo'q" });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ error: "Bir martada maksimal 1000 ta savol" });
    }

    var validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    var validAnswers = ["A", "B", "C", "D"];
    var validStatuses = ["published", "draft", "needs_review"];

    // Mavjud savollar matnini olamiz (duplicate tekshiruvi uchun)
    var existing = await pool.query("SELECT LOWER(TRIM(question_text)) AS qt FROM questions");
    var existingSet = {};
    existing.rows.forEach(function (r) { existingSet[r.qt] = true; });

    var inserted = 0, skipped = 0;
    var seenInBatch = {};
    var errors = [];

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var qText = (r.question_text || "").trim();
      var oA = (r.option_a || "").trim();
      var oB = (r.option_b || "").trim();
      var oC = (r.option_c || "").trim();
      var oD = (r.option_d || "").trim();
      var correct = (r.correct_option || "").trim().toUpperCase();
      var level = (r.cefr_level || "A1").trim().toUpperCase();
      var skill = (r.skill || "grammar").trim().toLowerCase();
      var explanation = (r.explanation || "").trim();
      var status = (r.status || "published").trim().toLowerCase();

      // Backend validatsiya (frontenddan mustaqil)
      if (!qText || qText.length < 3 || !oA || !oB || !oC || !oD) { skipped++; continue; }
      if (validAnswers.indexOf(correct) === -1) { skipped++; continue; }
      if (validLevels.indexOf(level) === -1) level = "A1";
      if (validStatuses.indexOf(status) === -1) status = "published";

      // Duplicate tekshiruvi (bazada yoki shu partiyada)
      var norm = qText.toLowerCase();
      if (existingSet[norm] || seenInBatch[norm]) { skipped++; continue; }
      seenInBatch[norm] = true;

      try {
        await pool.query(
          `INSERT INTO questions
           (question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, difficulty, explanation, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'easy',$9,$10)`,
          [qText, oA, oB, oC, oD, correct, level, skill, explanation, status]
        );
        inserted++;
      } catch (e) {
        skipped++;
        errors.push("Qator " + (i + 1) + ": " + e.message);
      }
    }

    await logAudit(req, "bulk_import_completed", { entityType: "question", details: inserted + " qo'shildi, " + skipped + " o'tkazib yuborildi" });

    res.json({ inserted: inserted, skipped: skipped, total: rows.length, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error("Bulk import xatosi:", err.message);
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
              bh.opponent_id, bh.mode,
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
    const userId = req.params.userId;

    // Asosiy foydalanuvchi ma'lumoti
    const userResult = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, xp, coins,
              current_streak, longest_streak, win_streak, best_win_streak,
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

    // Do'stlik holati (joriy foydalanuvchi bilan ko'rilayotgan profil orasida)
    let friendStatus = "none"; // none | friends | pending_sent | pending_received | self
    const viewerId = req.user.id;
    if (String(viewerId) === String(userId)) {
      friendStatus = "self";
    } else {
      try {
        const fr = await pool.query(
          `SELECT requester_id, receiver_id, status FROM friendships
           WHERE (requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1)
           LIMIT 1`,
          [viewerId, userId]
        );
        if (fr.rows.length > 0) {
          const f = fr.rows[0];
          if (f.status === "accepted") friendStatus = "friends";
          else if (f.status === "pending") {
            friendStatus = String(f.requester_id) === String(viewerId) ? "pending_sent" : "pending_received";
          }
        }
      } catch (e) {}
    }

    // Umumiy do'stlar (mutual friends) — viewer va ko'rilayotgan profil orasidagi
    let mutualFriends = [];
    let mutualCount = 0;
    if (friendStatus !== "self") {
      try {
        const mutualQ = await pool.query(
          `WITH viewer_friends AS (
             SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
             FROM friendships
             WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'
           ),
           target_friends AS (
             SELECT CASE WHEN requester_id = $2 THEN receiver_id ELSE requester_id END AS fid
             FROM friendships
             WHERE (requester_id = $2 OR receiver_id = $2) AND status = 'accepted'
           )
           SELECT u.id, u.first_name, u.last_name, u.profile_picture, u.rating
           FROM viewer_friends vf
           JOIN target_friends tf ON vf.fid = tf.fid
           JOIN users u ON u.id = vf.fid
           ORDER BY u.rating DESC`,
          [viewerId, userId]
        );
        mutualCount = mutualQ.rows.length;
        mutualFriends = mutualQ.rows.slice(0, 8); // birinchi 8 tasi
      } catch (e) {}
    }

    res.json({
      user: user,
      friendStatus: friendStatus,
      mutual_friends: mutualFriends,
      mutual_count: mutualCount,
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

// Barcha bildirishnomalarni o'chirish (bar yopilganda — eski xabarlarni tozalash)
app.post("/notifications/clear/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
    res.json({ message: "Barcha xabarlar o'chirildi" });
  } catch (err) {
    console.error("Bildirishnomalarni tozalash xatosi:", err.message);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Bitta bildirishnomani o'chirish (X tugmasi uchun)
app.delete("/notifications/:notifId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const notifId = parseInt(req.params.notifId, 10);
    if (isNaN(notifId)) return res.status(400).json({ error: "Noto'g'ri ID" });
    // Faqat o'ziniki bo'lgan xabarni o'chira oladi
    const result = await pool.query(
      "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
      [notifId, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Topilmadi" });
    res.json({ message: "O'chirildi", id: notifId });
  } catch (err) {
    console.error("Bildirishnoma o'chirish xatosi:", err.message);
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
    // O'qituvchi nomi + sinfdagi jami faol o'quvchilar soni (kartada ko'rsatish uchun).
    const classes = await pool.query(
      `SELECT c.id, c.name, c.description, c.join_code,
              cs.joined_at, cs.status,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              (SELECT COUNT(*) FROM class_students m WHERE m.class_id = c.id AND m.status = 'active') AS student_count
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