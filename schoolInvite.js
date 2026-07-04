// schoolInvite.js — Maktab admini taklif kodi: xavfsiz yaratish va hash bilan tekshirish
// ============================================================================
// FALSAFA (parentCode.js bilan bir xil): Kod xuddi "bir martalik parol" kabi.
// DB'da faqat HASH saqlanadi. Raw kod faqat yaratilган paytда bir marta admin
// paneliда ko'rsatiladi va maktab rahbariга beriladi — keyin qayta ko'rsatilmaydi.
//
// HASH USULI: SHA-256(code + PEPPER). "Pepper" — .env'даги maxfiy server kaliti.
//   • Pepper'siz hujumchi (DB leak bo'lса ham) hash'ни hisoblay olmaydi.
//   • Solt ishlatmaymiz (har kodga boshqa bo'lса, WHERE code_hash=$1 qidiruv buziladi).
//     Buning o'rniға: global pepper + muddат (30 kun) + bir martalik + rate-limit.
//
// NEGA PARENT KODДАН FARQLI:
//   • Uzunroq: 10 belgi × 32 alifbo = ~10^15 variant (parent koдда 8 edi).
//     Sabab: maktab kodi 30 kun yashaydi (parent kod 48 soat). Uzoq muddат =
//     kattaroq brute-force oynasi = ko'proq entropiya kerak.
//   • Formatlanган: "K7M2-P9XR-4T" ko'rinishида ko'rsatiladi (qo'lда kiritish oson).
//     Tekshiruvда tire'lar tashlab yuboriladi (normalize) — foydalanuvchi
//     tire bilan yoki tiresiz kiritsa ham ishlaydi.
// ============================================================================

const crypto = require("crypto");

// Chalkash belgilarsiz alifbo (O,0,I,1 yo'q — qo'lда xato o'qilmasin)
const SCHOOL_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SCHOOL_CODE_LEN = 10;             // 10 belgi — parent koddan uzunroq (uzoq muddат uchun)
const SCHOOL_CODE_TTL_DAYS = 30;        // default muddат (server shuni ishlatishi mumkin)

// Server pepper — .env'дан. Yo'q bo'lса JWT_SECRET'дан (baribir maxfiy).
// MUHIM: parent koддан ALOHIDA pepper — biri sizib chiqса, ikkinchisi xavfsiz qoladi.
function pepper() {
  return process.env.SCHOOL_INVITE_PEPPER || process.env.JWT_SECRET || "fallback-pepper-change-me";
}

// Raw koddan hash (qidirish va solishtirish uchun bir xil natija).
// Normalize: katta harf + faqat A-Z0-9 (tire, bo'shliq, kichik harf tashlanadi).
// Shuning uchun "k7m2-p9xr-4t", "K7M2P9XR4T", "K7M2 P9XR 4T" — barchasi bir xil hash.
function hashCode(rawCode) {
  const normalized = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return crypto.createHash("sha256").update(normalized + ":" + pepper()).digest("hex");
}

// Tasodifiy raw kod yaratish (faqat bir marta ko'rsatiladi).
// crypto.randomBytes — crypto-secure (Math.random EMAS — u bashorat qilinadi).
function generateRawCode() {
  let s = "";
  const bytes = crypto.randomBytes(SCHOOL_CODE_LEN);
  for (let i = 0; i < SCHOOL_CODE_LEN; i++) {
    s += SCHOOL_CODE_CHARS[bytes[i] % SCHOOL_CODE_CHARS.length];
  }
  return s;
}

// Ko'rsatish uchun chiroyli format: "K7M2P9XR4T" → "K7M2-P9XR-4T"
// Faqat KO'RSATISHда ishlatiladi. Hash/tekshiruvда tire baribir tashlanadi.
function formatForDisplay(rawCode) {
  const clean = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.replace(/(.{4})/g, "$1-").replace(/-$/, "");
}

module.exports = {
  SCHOOL_CODE_TTL_DAYS,
  hashCode,
  generateRawCode,
  formatForDisplay,
};