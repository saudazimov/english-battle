const { Pool } = require("pg");
require("dotenv").config();

// ============================================================================
// PostgreSQL ulanishi — local development va production managed DB ikkalasiga mos.
//
// SSL boshqaruvi (DB_SSL env orqali):
//   DB_SSL=true  → SSL yoqiladi (Supabase / Neon / Railway / Render / Heroku).
//                  rejectUnauthorized:false — managed provayderlarning
//                  self-signed / zanjirli sertifikatlariga ruxsat (ular xavfsiz TLS,
//                  faqat CA zanjiri Node'ning default store'ida bo'lmasligi mumkin).
//   DB_SSL=false yoki berilmagan → oddiy ulanish (local PostgreSQL).
//
// MUHIM: SSL hech qachon majburan yoqilmaydi — faqat DB_SSL=true bo'lganda.
// Bu local dev'ni buzmaydi (local Postgres odatda SSL'siz).
// ============================================================================

const useSSL = String(process.env.DB_SSL || "").toLowerCase() === "true";

const poolConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
};

if (useSSL) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

// Ulanishni tekshirish (startup diagnostikasi — server'ni to'xtatmaydi)
pool.connect((err, client, release) => {
  if (err) {
    console.error("Bazaga ulanishda xato:", err.message);
  } else {
    console.log(
      "PostgreSQL bazasiga muvaffaqiyatli ulandik!" +
      (useSSL ? " (SSL yoqilgan)" : " (SSL o'chiq — local)")
    );
    release();
  }
});

module.exports = pool;