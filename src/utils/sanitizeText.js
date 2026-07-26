// Sarlavha, nom va tavsif uchun yumshoq tozalash.
// Quote va apostroflarga tegmaydi; faqat HTML teg ochuvchi belgilar olib tashlanadi.
function sanitizeText(value, maxLength) {
  if (value == null) return value;
  const output = String(value).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return maxLength ? output.slice(0, maxLength) : output;
}

module.exports = { sanitizeText };
