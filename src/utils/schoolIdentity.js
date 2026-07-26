// Bir xil nomli maktablar turli hududlarda bo'lishi mumkin. Turnirlar ichida
// maktabni faqat nom bilan emas, region + district + school uchligi bilan taniymiz.
// CHR(31) foydalanuvchi kiritadigan odatiy matnda uchramaydigan ajratuvchi bo'lib,
// migrations/015_school_identity.sql bilan aynan bir xil formatni beradi.
function schoolIdentityKey(region, district, school) {
  const parts = [region, district, school].map((value) =>
    typeof value === "string" ? value.trim() : ""
  );
  if (parts.some((value) => !value || value.includes("\x1f"))) return null;
  return parts.join("\x1f");
}

module.exports = { schoolIdentityKey };
