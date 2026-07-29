const {
  createTeacherAssignmentListService,
} = require("../services/teacherAssignmentListService");

function createTeacherAssignmentListController({ pool, logger = console, now }) {
  const service = createTeacherAssignmentListService({ pool, now });
  return {
    async list(req, res) {
      try {
        res.json(await service.listAssignments(req.user.id));
      } catch (error) {
        logger.error("/teacher/assignments xatosi:", error);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createTeacherAssignmentListController };
