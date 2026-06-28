// parentCode.js — Parent connect-code: xavfsiz yaratish va hash bilan tekshirish
// ============================================================================
// FALSAFA: Kod xuddi "bir martalik parol" kabi. DB'da faqat HASH saqlanadi.
// Raw kod faqat yaratilgan paytda bir marta o'quvchiga ko'rsatiladi.
//
// HASH USULI: SHA-256(code + PEPPER). "Pepper" — .env'dagi maxfiy server kaliti.
//   • Pepper'siz hujumchi (DB leak bo'lsa ham) hash'ni hisoblay olmaydi
//     (rainbow-table ishlamaydi).
//   • Solt ishlatmaymiz (har kodga boshqa bo'lsa, WHERE hash=$1 qidiruv buziladi).
//     Buning o'rniga bitta global pepper + qisqa TTL + bir martalik = yetarli.
//   • Kod 8 belgi × 32 alifbo = ~10^12 variant — TTL (48s) ichida brute-force
//     amalda imkonsiz, ustiga rate-limit ham bor.
// ============================================================================

const crypto = require("crypto");

// Chalkash belgilarsiz alifbo (O,0,I,1 yo'q — o'quvchi xato o'qimasin)
const PARENT_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PARENT_CODE_LEN = 8;
const PARENT_CODE_TTL_HOURS = 48; // 7 kun → 48 soat (qisqaroq xavf oynasi)

// Server pepper — .env'dan. Yo'q bo'lsa JWT_SECRET'dan foydalanamiz (baribir maxfiy).
function pepper() {
  return process.env.PARENT_CODE_PEPPER || process.env.JWT_SECRET || "fallback-pepper-change-me";
}

// Raw koddan hash (qidirish va solishtirish uchun bir xil natija beradi)
function hashCode(rawCode) {
  const normalized = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return crypto.createHash("sha256").update(normalized + ":" + pepper()).digest("hex");
}

// Tasodifiy raw kod yaratish (faqat bir marta ko'rsatiladi)
function generateRawCode() {
  let s = "";
  const bytes = crypto.randomBytes(PARENT_CODE_LEN); // crypto-secure tasodif
  for (let i = 0; i < PARENT_CODE_LEN; i++) {
    s += PARENT_CODE_CHARS[bytes[i] % PARENT_CODE_CHARS.length];
  }
  return s;
}

module.exports = {
  PARENT_CODE_TTL_HOURS,
  hashCode,
  generateRawCode,
};