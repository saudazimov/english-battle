// Telefon raqamlari bazada yagona E.164 ko'rinishida saqlanadi:
// + va 8-15 ta raqam (masalan +998901234567).
function normalizePhone(rawPhone) {
  if (typeof rawPhone !== "string") return null;
  let phone = rawPhone.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

module.exports = { normalizePhone };
