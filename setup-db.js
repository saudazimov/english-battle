const fs = require("fs");
const pool = require("./db");

async function setupDatabase() {
  try {
    // schema.sql faylini o'qish
    const schema = fs.readFileSync("./schema.sql", "utf8");

    // Bazada bajarish
    await pool.query(schema);

    console.log("Jadvallar muvaffaqiyatli yaratildi!");
  } catch (err) {
    console.error("Jadval yaratishda xato:", err.message);
  } finally {
    await pool.end();
  }
}

setupDatabase();