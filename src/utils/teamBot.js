const TEAM_BOT_NAMES = [
  "Sardor", "Jasur", "Aziz", "Bobur", "Dilshod", "Kamol",
  "Nodir", "Olim", "Rustam", "Sherzod", "Tohir", "Umid",
];

function makeTeamBot(refPlayer, index) {
  const botName = TEAM_BOT_NAMES[Math.floor(Math.random() * TEAM_BOT_NAMES.length)];
  return {
    socketId: "pbot_" + Date.now() + "_" + index + "_" + Math.floor(Math.random() * 1000),
    userId: null,
    name: botName,
    level: refPlayer ? refPlayer.level : "A1",
    lengthKey: refPlayer ? refPlayer.lengthKey : "standard",
    rating: refPlayer && refPlayer.rating
      ? Math.max(800, refPlayer.rating + Math.floor(Math.random() * 200 - 100))
      : 1000 + Math.floor(Math.random() * 700),
    isBot: true,
  };
}

module.exports = { makeTeamBot };
