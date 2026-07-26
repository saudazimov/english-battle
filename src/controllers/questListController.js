function createQuestListController({
  getOrCreateDailyQuests,
  logger = console,
}) {
  return {
    async list(req, res) {
      try {
        const userId = req.user.id;
        const quests = await getOrCreateDailyQuests(userId);
        res.json({ quests: quests });
      } catch (error) {
        logger.error("Quests xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createQuestListController };
