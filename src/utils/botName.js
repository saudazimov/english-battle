const BOT_NAMES = ["Aziz", "Malika", "Bobur", "Nigora", "Sardor", "Dilnoza", "Jahongir", "Zarina"];

function getRandomBotName() {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

module.exports = { getRandomBotName };
