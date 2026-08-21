const {
  createSmartboardQuestionService,
} = require("../services/smartboardQuestionService");

function createSmartboardGameController({ pool, logger = console }) {
  const service = createSmartboardQuestionService({ pool });

  return {
    async questions(req, res) {
      try {
        const result = await service.list(req.query);
        if (result.status === "invalid") {
          return res.status(400).json({ error: "Noto'g'ri smart board parametrlari" });
        }
        if (result.status === "insufficient") {
          return res.status(422).json({
            error: "Tanlangan darajada grammatika savollari yetarli emas",
            available: result.available,
            required: result.required,
          });
        }

        return res.json({
          level: result.level,
          skill: result.skill,
          total: result.questions.length,
          questions: result.questions,
        });
      } catch (error) {
        logger.error("Smart board savollarini yuklash xatosi:", error.message);
        return res.status(500).json({ error: "Server xatosi" });
      }
    },

    async words(req, res) {
      try {
        const result = await service.listWords(req.query);
        if (result.status === "invalid") {
          return res.status(400).json({ error: "Noto'g'ri Word Builder parametrlari" });
        }
        if (result.status === "insufficient") {
          return res.status(422).json({
            error: "Tanlangan darajada Word Builder uchun so'zlar yetarli emas",
            available: result.available,
            required: result.required,
          });
        }

        return res.json({
          level: result.level,
          total: result.words.length,
          words: result.words,
        });
      } catch (error) {
        logger.error("Word Builder so'zlarini yuklash xatosi:", error.message);
        return res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createSmartboardGameController };
