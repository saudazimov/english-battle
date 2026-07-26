const BATTLE_LENGTHS = {
  quick: { label: "Quick", questions: 10, secondsPerQuestion: 15, totalSeconds: 150, xp: 4, coins: 1 },
  standard: { label: "Standard", questions: 20, secondsPerQuestion: 15, totalSeconds: 300, xp: 8, coins: 2 },
  extended: { label: "Extended", questions: 30, secondsPerQuestion: 15, totalSeconds: 450, xp: 12, coins: 3 },
  marathon: { label: "Marathon", questions: 40, secondsPerQuestion: 15, totalSeconds: 600, xp: 16, coins: 4 },
};

function lengthConfig(key) {
  return BATTLE_LENGTHS[key] || BATTLE_LENGTHS.standard;
}

module.exports = { BATTLE_LENGTHS, lengthConfig };
