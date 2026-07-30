const { Pool } = require("pg");
require("dotenv").config();
const { createDatabasePoolConfig } = require("./src/config/databasePoolConfig");

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

const poolConfig = createDatabasePoolConfig(process.env);
const useSSL = Boolean(poolConfig.ssl);
const pool = new Pool(poolConfig);

// Development diagnostikasi saqlanadi. Production ulanishi HTTP listen'dan
// oldingi bounded readiness preflight orqali tekshiriladi.
if (process.env.NODE_ENV !== "production") {
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
}

module.exports = pool;
