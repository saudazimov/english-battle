// migrate.js — Ma'lumotlar bazasi migration tizimi (versiyalangan, tartibli, idempotent)
// ============================================================================
// MAQSAD: schema.sql bilan jonli DB o'rtasidagi farqni yo'qotish. Endi har bir
// o'zgarish raqamlangan migration fayl bo'ladi. Bu fayl ularni TARTIB bilan,
// FAQAT BIR MARTA bajaradi va qaysi biri bajarilganini `schema_migrations`
// jadvalida kuzatadi.
//
// ISHLATISH:
//   node migrate.js          -> hali bajarilmagan barcha migration'larni qo'llaydi
//   node migrate.js status   -> qaysi migration bajarilgan / kutilmoqda ko'rsatadi
//
// QOIDA: Migration fayllar `migrations/` papkasida, nomi raqam bilan boshlanadi:
//   001_baseline.sql, 002_add_role.sql, 003_add_country.sql ...
// Raqam tartibi = bajarilish tartibi. Bajarilgan migration HECH QACHON
// qayta o'zgartirilmaydi — yangi o'zgarish = yangi fayl.
// ============================================================================

const fs = require("fs");
const path = require("path");
const pool = require("./db");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Migration kuzatuv jadvalini yaratish (agar yo'q bo'lsa)
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     VARCHAR(255) PRIMARY KEY,   -- fayl nomi (masalan "002_add_role.sql")
      applied_at  TIMESTAMP NOT NULL DEFAULT NOW(),
      checksum    VARCHAR(64)                 -- fayl mazmunining SHA-256 (o'zgarishni aniqlash)
    )
  `);
}

// Papkadagi barcha .sql migration'larni TARTIB bilan o'qish
function readMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error("XATO: migrations/ papkasi topilmadi:", MIGRATIONS_DIR);
    process.exit(1);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 001, 002, 003 ... alifbo/raqam tartibi
}

// Fayl checksum (mazmun o'zgarganini aniqlash uchun)
function checksumOf(content) {
  return require("crypto").createHash("sha256").update(content).digest("hex");
}

// Bajarilgan migration'lar ro'yxati (DB'dan)
async function getApplied(client) {
  const res = await client.query("SELECT version, checksum FROM schema_migrations");
  const map = {};
  res.rows.forEach((r) => { map[r.version] = r.checksum; });
  return map;
}

// --- ASOSIY: barcha kutilayotgan migration'larni qo'llash ---
async function migrate() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    const files = readMigrationFiles();
    const applied = await getApplied(client);

    let ranCount = 0;

    for (const file of files) {
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      const sum = checksumOf(sql);

      // Allaqachon bajarilganmi?
      if (applied[file]) {
        // Bajarilgan fayl o'zgartirilgan bo'lsa — OGOHLANTIRISH (lekin to'xtatmaymiz)
        if (applied[file] !== sum) {
          console.warn(`⚠️  OGOHLANTIRISH: "${file}" allaqachon bajarilgan, lekin mazmuni o'zgargan.`);
          console.warn(`    Bajarilgan migration'ni o'zgartirmang — yangi migration fayl yarating.`);
        }
        continue;
      }

      // Yangi migration — TRANSACTION ichida bajaramiz (yarim bajarilib qolmasin)
      console.log(`▶️  Qo'llanyapti: ${file}`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [file, sum]
        );
        await client.query("COMMIT");
        console.log(`✅ Bajarildi: ${file}`);
        ranCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`❌ XATO (${file}):`, err.message);
        console.error("    Migration to'xtatildi. Hech qanday yarim o'zgarish saqlanmadi.");
        process.exit(1);
      }
    }

    if (ranCount === 0) {
      console.log("✨ Hammasi yangilangan — kutilayotgan migration yo'q.");
    } else {
      console.log(`✨ Tugadi — ${ranCount} ta migration qo'llandi.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// --- STATUS: qaysi bajarilgan / qaysi kutilmoqda ---
async function status() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const files = readMigrationFiles();
    const applied = await getApplied(client);

    console.log("\n  Holat   Migration");
    console.log("  ──────  ─────────────────────────────");
    for (const file of files) {
      const mark = applied[file] ? "✅ done" : "⏳ kutil";
      console.log(`  ${mark}  ${file}`);
    }
    console.log("");
  } finally {
    client.release();
    await pool.end();
  }
}

// CLI
const cmd = process.argv[2];
if (cmd === "status") {
  status();
} else {
  migrate();
}