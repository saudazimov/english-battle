const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Ulanishni tekshirish
pool.connect((err, client, release) => {
  if (err) {
    console.error("Bazaga ulanishda xato:", err.message);
  } else {
    console.log("PostgreSQL bazasiga muvaffaqiyatli ulandik!");
    release();
  }
});

module.exports = pool;