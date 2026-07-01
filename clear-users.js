// clear-users.js — Barcha foydalanuvchilarni va ular bilan bog'liq ma'lumotni tozalash
// ============================================================================
// ⚠️  OGOHLANTIRISH: Bu QAYTARIB BO'LMAYDIGAN operatsiya!
//     Barcha o'quvchi/o'qituvchi/ota-ona/maktab akkauntlari va ular bilan bog'liq
//     HAMMA narsa (janglar, reytinglar, obunalar, to'lovlar, AI hisobotlar) o'chadi.
//
// SAQLANADI:
//   • Admin (users'da emas — admin_settings/.env'da, tegmaydi)
//   • Savollar (questions — admin yaratgan kontent, ixtiyoriy: pastга qarang)
//   • Kvestlar (quests — admin kontenti)
//   • admin_settings (admin paroli)
//
// ISHLATISH:
//   node clear-users.js           → tasdiqlash so'raydi (xavfsiz)
//   node clear-users.js --force   → to'g'ridan-to'g'ri tozalaydi (ehtiyot!)
//
// ============================================================================

const pool = require("./db");
const readline = require("readline");

// SAQLANADIGAN jadvallar (TRUNCATE'ga kirmaydi — admin kontenti):
//   questions, quests, admin_settings, audit_logs
// Tozalash TRUNCATE ... CASCADE bilan amalga oshadi (clearAll funksiyada).

async function getCounts() {
  const counts = {};
  try {
    const u = await pool.query("SELECT COUNT(*)::int AS c FROM users");
    counts.users = u.rows[0].c;
    // Rol bo'yicha
    const byRole = await pool.query("SELECT role, COUNT(*)::int AS c FROM users GROUP BY role ORDER BY role");
    counts.byRole = byRole.rows;
  } catch (e) {
    counts.error = e.message;
  }
  return counts;
}

async function clearAll() {
  // 1. AVVAL (tranzaksiyadan TASHQARIDA): questions.created_by ni NULL qilamiz.
  //    Bu ixtiyoriy — savollar saqlanishi uchun. Xato bo'lsa ham (ustun yo'q),
  //    tranzaksiyaga ta'sir qilmaydi, chunki alohida bajariladi.
  try {
    await pool.query("UPDATE questions SET created_by = NULL WHERE created_by IS NOT NULL");
  } catch (e) {
    // created_by ustuni yo'q yoki questions users'ga bog'liq emas — muammo emas, davom etamiz
    console.log("  (questions.created_by yangilanmadi — muhim emas, davom etamiz)");
  }

  // 2. ASOSIY tozalash (tranzaksiya ichida): TRUNCATE CASCADE
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // TRUNCATE ... CASCADE: PostgreSQL users'ga bog'liq BARCHA jadvalни
    // avtomatik aniqlaydi va tozalaydi. RESTART IDENTITY — ID'lar 1 dan.
    // SAQLANADI: questions, quests, admin_settings, audit_logs (CASCADE'ga kirmaydi).
    await client.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE");

    await client.query("COMMIT");
    console.log("\n✅ Tozalandi — barcha foydalanuvchilar va bog'liq ma'lumot o'chirildi.");
    console.log("   ID lar 1 dan boshlanadi.");
    console.log("   SAQLANDI: admin (alohida tizim), savollar, kvestlar.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n❌ XATO — hech narsa o'chirilmadi (orqaga qaytarildi):", e.message);
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const force = process.argv.includes("--force");

  console.log("=".repeat(60));
  console.log("  FOYDALANUVCHILARNI TOZALASH");
  console.log("=".repeat(60));

  const counts = await getCounts();
  if (counts.error) {
    console.error("Bazaga ulanishда xato:", counts.error);
    process.exit(1);
  }

  console.log(`\nHozir bazada: ${counts.users} ta foydalanuvchi`);
  if (counts.byRole && counts.byRole.length) {
    counts.byRole.forEach((r) => console.log(`   • ${r.role}: ${r.c} ta`));
  }

  if (counts.users === 0) {
    console.log("\nFoydalanuvchi yo'q — tozalashga hojat yo'q.");
    process.exit(0);
  }

  console.log("\n⚠️  Bu operatsiya QAYTARIB BO'LMAYDI!");
  console.log("   Barcha foydalanuvchilar va ular bilan bog'liq HAMMA narsa o'chadi");
  console.log("   (janglar, reytinglar, obunalar, to'lovlar, AI hisobotlar).");
  console.log("   Admin, savollar va kvestlar SAQLANADI.\n");

  if (force) {
    console.log("--force berildi, tozalanyapti...\n");
    await clearAll();
    process.exit(0);
  }

  // Tasdiqlash so'raymiz
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Davom etish uchun "TOZALA" deb yozing (boshqa narsa = bekor): ', async (answer) => {
    rl.close();
    if (answer.trim() === "TOZALA") {
      console.log("\nTozalanyapti...\n");
      try {
        await clearAll();
        process.exit(0);
      } catch (e) {
        process.exit(1);
      }
    } else {
      console.log("\nBekor qilindi — hech narsa o'chirilmadi.");
      process.exit(0);
    }
  });
}

main();