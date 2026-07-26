function createLegacyTeamBotFillService({
  teamQueues,
  teamQueueTimers,
  startTeamBattle,
  logger = console,
  random = () => Math.random(),
  now = () => Date.now(),
  clearTimeoutFn = (timer) => clearTimeout(timer),
}) {
  return function fillTeamWithBots(teamMode, teamSize, needed) {
    try {
      const queue = teamQueues[teamMode];
      if (queue.length === 0) return;

      const botNames = [
        "Sardor", "Jasur", "Aziz", "Bobur", "Dilshod",
        "Kamol", "Nodir", "Olim", "Rustam", "Sherzod",
      ];
      const group = queue.splice(0, queue.length);
      const botsNeeded = needed - group.length;

      for (let index = 0; index < botsNeeded; index++) {
        const botName = botNames[Math.floor(random() * botNames.length)];
        group.push({
          socketId: `tbot_${teamMode}_${now()}_${index}`,
          userId: null,
          name: botName,
          level: group[0] ? group[0].level : "A1",
          lengthKey: group[0] ? group[0].lengthKey : "standard",
          rating: 1000,
          isBot: true,
        });
      }

      logger.log(`Jamoa navbati bot bilan to'ldirildi [${teamMode}]: ${group.length} o'yinchi (${botsNeeded} bot)`);
      if (teamQueueTimers[teamMode]) {
        clearTimeoutFn(teamQueueTimers[teamMode]);
        delete teamQueueTimers[teamMode];
      }
      startTeamBattle(group, teamMode, teamSize);
    } catch (error) {
      logger.error("fillTeamWithBots xatosi:", error.message);
    }
  };
}

module.exports = { createLegacyTeamBotFillService };
