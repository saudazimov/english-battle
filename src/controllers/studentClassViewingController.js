const {
  createStudentClassViewingService,
} = require("../services/studentClassViewingService");

function createStudentClassViewingController({
  pool,
  activeClassMembership,
  logger = console,
}) {
  const service = createStudentClassViewingService({ pool, activeClassMembership });
  return {
    async list(req, res) {
      try {
        res.json({ classes: await service.listClasses(req.user.id) });
      } catch (error) {
        logger.error("O'quvchi sinflari xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },

    async ranking(req, res) {
      try {
        const classId = parseInt(req.params.classId, 10);
        if (!Number.isInteger(classId)) {
          return res.status(400).json({ error: "Noto'g'ri sinf ID" });
        }
        const result = await service.getRanking(classId, req.user.id);
        if (!result) return res.status(404).json({ error: "Sinf topilmadi" });
        res.json(result);
      } catch (error) {
        logger.error("Sinf reytingi xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createStudentClassViewingController };
