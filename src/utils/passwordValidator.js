// ===== PAROL KUCHINI TEKSHIRISH (bolalar platformasi — muvozanatli qoidalar) =====
// 8+ belgi, kamida bitta harf va bitta raqam. Maxsus belgi ixtiyoriy (13-qoida).
function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, error: "Parol kamida 8 belgi bo'lishi kerak" };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: "Parolda kamida bitta harf bo'lishi kerak" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Parolda kamida bitta raqam bo'lishi kerak" };
  }
  if (password.length > 128) {
    return { valid: false, error: "Parol juda uzun (maksimal 128 belgi)" };
  }
  return { valid: true };
}

module.exports = { validatePassword };
