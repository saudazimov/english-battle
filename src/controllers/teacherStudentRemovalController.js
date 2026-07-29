const {
  createTeacherStudentRemovalService,
} = require("../services/teacherStudentRemovalService");

function createTeacherStudentRemovalController({ pool }) {
  const service = createTeacherStudentRemovalService({ pool });

  async function removeStudent(req, res) {
    try {
      const teacherId = req.user.id;
      const classId = parseInt(req.params.classId, 10);
      const studentId = parseInt(req.params.studentId, 10);

      if (isNaN(classId) || isNaN(studentId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }

      const result = await service.removeStudent({ teacherId, classId, studentId });
      if (result === "class-not-found") {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      if (result === "student-not-found") {
        return res.status(404).json({ error: "O'quvchi bu sinfda topilmadi" });
      }

      return res.json({ message: "O'quvchi sinfdan olib tashlandi" });
    } catch (err) {
      console.error("O'quvchini olib tashlash xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { removeStudent };
}

module.exports = { createTeacherStudentRemovalController };
