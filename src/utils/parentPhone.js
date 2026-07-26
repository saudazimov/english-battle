function maskParentPhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return "+" + digits.slice(0, 3) + " ** *** ** " + digits.slice(-2);
}

module.exports = { maskParentPhone };
