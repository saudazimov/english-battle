// XSS himoyasi: foydalanuvchi matnidan HTML/skript belgilarini olib tashlaydi.
// Apostrof (') va o'zbekcha ʻ saqlanadi — faqat < > " ` \ olib tashlanadi.
function stripUnsafe(value, maxLength) {
  if (value == null) return value;
  const output = String(value).replace(/[<>"`\\]/g, "").replace(/\s+/g, " ").trim();
  return maxLength ? output.slice(0, maxLength) : output;
}

module.exports = { stripUnsafe };
