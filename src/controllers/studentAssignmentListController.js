const {
  createStudentAssignmentListService,
} = require("../services/studentAssignmentListService");

function createStudentAssignmentListController({ pool, logger = console }) {
  const service = createStudentAssignmentListService({ pool });
  return {
    async list(req, res) {
      try {
        res.json({ assignments: await service.listAssignments(req.user.id) });
      } catch (error) {
        logger.error("O'quvchi topshiriqlari xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createStudentAssignmentListController };
