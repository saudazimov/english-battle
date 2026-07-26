const { stripUnsafe } = require("./stripUnsafe");

function normalizeSchool(school) {
  if (!school) return null;

  let normalized = school.trim().toLowerCase();
  if (normalized === "") return null;

  const numberMatch = normalized.match(/\d+/);
  if (numberMatch) {
    const number = numberMatch[0];
    return number + "-maktab";
  }

  return stripUnsafe(normalized, 200);
}

module.exports = { normalizeSchool };
