// setup-db.js — Bazani sozlash (ENDI migration tizimi orqali)
// ============================================================================
// ESKI USUL (muammoli): bu fayl to'g'ridan-to'g'ri schema.sql'ni bajarardi.
// Muammo: schema.sql kod bilan moslashmay qolgan edi (email NOT NULL, role yo'q).
//
// YANGI USUL: bu fayl endi migrate.js'ni chaqiradi — barcha versiyalangan
// migration'larni TARTIB bilan, FAQAT BIR MARTA qo'llaydi. Bu yangi muhitda ham,
// mavjud bazada ham xavfsiz ishlaydi.
//
// ISHLATISH: node setup-db.js   (yoki to'g'ridan-to'g'ri: node migrate.js)
// ============================================================================

const { execSync } = require("child_process");

console.log("Baza sozlanyapti — migration tizimi ishga tushyapti...\n");

try {
  // migrate.js'ni shu Node jarayonida emas, alohida ishga tushiramiz
  // (u o'z pool'ini ochib-yopadi, toza bo'ladi).
  execSync("node migrate.js", { stdio: "inherit", cwd: __dirname });
  console.log("\nBaza tayyor.");
} catch (err) {
  console.error("\nBazani sozlashda xato. Migration loglarini tekshiring.");
  process.exit(1);
}