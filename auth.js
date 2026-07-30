// auth.js — JWT authentication foundation
// Bu fayl token yaratish va tekshirish uchun. Hech qanday endpointni majburlamaydi (Step 1A).

const jwt = require("jsonwebtoken");
require("dotenv").config();

// Maxfiy kalit .env dan olinadi. Agar yo'q bo'lsa — server ishga tushmasin (xavfsizlik).
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const pool = require("./db");

if (!JWT_SECRET) {
  console.error("XATO: JWT_SECRET .env faylida topilmadi! Server to'xtatildi.");
  process.exit(1);
}

// 1. TOKEN YARATISH
// Foydalanuvchi login/register qilganda chaqiriladi.
// Token ichiga FAQAT id va telefon yoziladi (maxfiy ma'lumot emas).
function signToken(user) {
  const payload = {
    id: user.id,
    phone: user.phone,
    ver: Number(user.auth_version) || 0,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// 2. TOKENNI TEKSHIRISH (MIDDLEWARE)
// Himoyalangan route'larda ishlatiladi. Token to'g'ri bo'lsa req.user ni o'rnatadi.
// Step 1A da hali hech bir route buni ishlatmaydi — biz faqat tayyorlab qo'yamiz.
async function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];

  // Header bormi va "Bearer <token>" ko'rinishidami?
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Avtorizatsiya tokeni yo'q" });
  }

  const token = authHeader.split(" ")[1];
  let decoded;
  try {
    // Tokenni tekshirish
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token muddati tugagan, qaytadan kiring" });
    }
    return res.status(401).json({ error: "Token noto'g'ri" });
  }

  try {
    const result = await pool.query(
      "SELECT id, phone, is_banned, auth_version FROM users WHERE id = $1",
      [decoded.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "Hisob topilmadi, qaytadan kiring" });
    if (user.is_banned) return res.status(401).json({ error: "Hisobingiz bloklangan" });
    if ((Number(decoded.ver) || 0) !== (Number(user.auth_version) || 0)) {
      return res.status(401).json({ error: "Sessiya bekor qilingan, qaytadan kiring" });
    }

    // MUHIM: bundan keyin route faqat bazada tasdiqlangan ma'lumotga ishonadi.
    req.user = { id: user.id, phone: user.phone, auth_version: Number(user.auth_version) || 0 };

    next();
  } catch (err) {
    console.error("authMiddleware xatosi:", err.message);
    return res.status(500).json({ error: "Server xatosi" });
  }
}

// 3. TEACHER TEKSHIRUVI (MIDDLEWARE)
// Faqat role="teacher" (yoki "school_admin") bo'lgan foydalanuvchilarni o'tkazadi.
// MUHIM: rolni bazadan tekshiradi (frontend yoki eski tokenga ishonmaydi).
// Avval authMiddleware ishlashi kerak (req.user.id bo'lishi uchun).
function requireTeacher(req, res, next) {
  // authMiddleware allaqachon req.user ni o'rnatgan bo'lishi kerak
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "Avtorizatsiya kerak" });
  }

  pool.query("SELECT role FROM users WHERE id = $1", [req.user.id])
    .then((result) => {
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Foydalanuvchi topilmadi" });
      }
      const role = result.rows[0].role;
      // Faqat teacher yoki school_admin ruxsat etiladi
      if (role !== "teacher" && role !== "school_admin") {
        return res.status(403).json({ error: "Bu sahifaga faqat o'qituvchilar kira oladi" });
      }
      // Rolni keyingi ishlatish uchun saqlaymiz
      req.user.role = role;
      next();
    })
    .catch((err) => {
      console.error("requireTeacher xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    });
}

// 4. STUDENT TEKSHIRUVI (MIDDLEWARE)
// Faqat role="student" bo'lgan foydalanuvchilarni o'tkazadi.
// Avval authMiddleware ishlashi kerak (req.user.id bo'lishi uchun).
function requireStudent(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "Avtorizatsiya kerak" });
  }

  pool.query("SELECT role FROM users WHERE id = $1", [req.user.id])
    .then((result) => {
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Foydalanuvchi topilmadi" });
      }
      const role = result.rows[0].role;
      if (role !== "student") {
        return res.status(403).json({ error: "Bu amal faqat o'quvchilar uchun" });
      }
      req.user.role = role;
      next();
    })
    .catch((err) => {
      console.error("requireStudent xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    });
}

// 5. OTA-ONA TEKSHIRUVI (MIDDLEWARE)
// Faqat role="parent" bo'lgan foydalanuvchilarni o'tkazadi.
// MUHIM: rolni bazadan tekshiradi (frontend yoki eski tokenga ishonmaydi).
// Avval authMiddleware ishlashi kerak (req.user.id bo'lishi uchun).
function requireParent(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: "Avtorizatsiya kerak" });
  }

  pool.query("SELECT role FROM users WHERE id = $1", [req.user.id])
    .then((result) => {
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "Foydalanuvchi topilmadi" });
      }
      const role = result.rows[0].role;
      if (role !== "parent") {
        return res.status(403).json({ error: "Bu amal faqat ota-onalar uchun" });
      }
      req.user.role = role;
      next();
    })
    .catch((err) => {
      console.error("requireParent xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    });
}

// ===== ADMIN AUTH =====
// Admin uchun alohida token — ichida isAdmin belgisi bor.
// Oddiy user tokenidan farq qiladi (admin huquqlari uchun).
const ADMIN_TOKEN_EXPIRES = "24h"; // admin token 24 soat amal qiladi

function signAdminToken(adminName, authVersion) {
  return jwt.sign(
    { isAdmin: true, adminName: adminName || "Admin", role: "super_admin", ver: Number(authVersion) || 0 },
    JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_EXPIRES }
  );
}

// Admin himoyalangan endpointlar uchun middleware.
// Token'ni tekshiradi, isAdmin:true bo'lishini talab qiladi.
async function requireAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Admin tokeni yo'q" });
  }
  const token = authHeader.split(" ")[1];
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Admin token muddati tugagan, qaytadan kiring" });
    }
    return res.status(401).json({ error: "Admin token noto'g'ri" });
  }

  // MUHIM: faqat isAdmin:true bo'lgan token o'tadi (oddiy user tokeni emas)
  if (!decoded.isAdmin) {
    return res.status(403).json({ error: "Admin huquqi kerak" });
  }

  try {
    const versionResult = await pool.query(
      "SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_auth_version'"
    );
    const currentVersion = versionResult.rows.length ? Number(versionResult.rows[0].setting_value) || 0 : 0;
    if ((Number(decoded.ver) || 0) !== currentVersion) {
      return res.status(401).json({ error: "Admin sessiyasi bekor qilingan, qaytadan kiring" });
    }

    req.admin = { name: decoded.adminName || "Admin", role: decoded.role || "admin" };
    next();
  } catch (err) {
    console.error("requireAdmin xatosi:", err.message);
    return res.status(500).json({ error: "Server xatosi" });
  }
}

// SOCKET TOKEN TEKSHIRUVI
// Socket.io ulanishida JWT tokenni tekshiradi. Token to'g'ri bo'lsa — { id, phone } qaytaradi.
// Noto'g'ri/yo'q bo'lsa — null. Bu HTTP authMiddleware bilan bir xil JWT_SECRET'ni ishlatadi.
function verifySocketToken(token) {
  try {
    if (!token || typeof token !== "string") return null;
    // "Bearer xxx" formatida kelsa, prefiksni olib tashlaymiz
    if (token.startsWith("Bearer ")) token = token.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    return { id: decoded.id, phone: decoded.phone, ver: Number(decoded.ver) || 0 };
  } catch (err) {
    return null; // muddati o'tgan yoki soxta
  }
}

module.exports = { signToken, authMiddleware, requireTeacher, requireStudent, requireParent, signAdminToken, requireAdmin, verifySocketToken };
