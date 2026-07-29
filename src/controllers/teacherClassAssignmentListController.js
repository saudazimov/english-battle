const {
  createTeacherClassAssignmentListService,
} = require("../services/teacherClassAssignmentListService");

function createTeacherClassAssignmentListController({ pool }) {
  const service = createTeacherClassAssignmentListService({ pool });

  async function listAssignments(req, res) {
    try {
      const teacherId = req.user.id;
      const classId = parseInt(req.params.classId, 10);
      if (isNaN(classId)) {
        return res.status(400).json({ error: "Noto'g'ri sinf ID" });
      }

      const assignments = await service.listAssignments({
        classId,
        teacherId,
        statusFilter: req.query.status,
      });
      if (!assignments) return res.status(404).json({ error: "Sinf topilmadi" });

      return res.json({ assignments });
    } catch (err) {
      console.error("Topshiriqlar ro'yxati xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { listAssignments };
}

module.exports = { createTeacherClassAssignmentListController };
