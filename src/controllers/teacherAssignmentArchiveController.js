const {
  createTeacherAssignmentArchiveService,
} = require("../services/teacherAssignmentArchiveService");

function createTeacherAssignmentArchiveController({ pool }) {
  const service = createTeacherAssignmentArchiveService({ pool });

  async function archiveAssignment(req, res) {
    try {
      const teacherId = req.user.id;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Noto'g'ri ID" });

      const archived = await service.archiveAssignment(id, teacherId);
      if (!archived) return res.status(404).json({ error: "Topshiriq topilmadi" });

      return res.json({ success: true, message: "Topshiriq arxivlandi" });
    } catch (err) {
      console.error("Topshiriq arxivlash xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { archiveAssignment };
}

module.exports = { createTeacherAssignmentArchiveController };
