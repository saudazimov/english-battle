const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function getNextLevel(current) {
  const index = LEVEL_ORDER.indexOf(current);
  if (index === -1 || index === LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[index + 1];
}

module.exports = { getNextLevel };
