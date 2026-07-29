const {
  createTeacherStudentRosterService,
} = require("../services/teacherStudentRosterService");

function createTeacherStudentRosterController({ pool, logger = console }) {
  const service = createTeacherStudentRosterService({ pool });
  return {
    async classStudents(req, res) {
      try {
        const classId = parseInt(req.params.classId, 10);
        if (isNaN(classId)) {
          return res.status(400).json({ error: "Noto'g'ri sinf ID" });
        }
        const result = await service.getClassStudents(classId, req.user.id);
        if (!result) return res.status(404).json({ error: "Sinf topilmadi" });
        res.json(result);
      } catch (error) {
        logger.error("Sinf o'quvchilari xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },

    async allStudents(req, res) {
      try {
        res.json(await service.listStudents(req.user.id));
      } catch (error) {
        logger.error("/teacher/students xatosi:", error);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createTeacherStudentRosterController };
