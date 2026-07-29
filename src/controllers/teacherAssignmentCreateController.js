const {
  createTeacherAssignmentCreateService,
} = require("../services/teacherAssignmentCreateService");

const ASSIGN_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const ASSIGN_SKILLS = ["mixed", "grammar", "vocabulary", "reading", "listening", "speaking", "writing"];

function createTeacherAssignmentCreateController({ pool, premium, logAudit, sanitizeText }) {
  const service = createTeacherAssignmentCreateService({ pool, premium, logAudit });

  async function createAssignment(req, res) {
    const teacherId = req.user.id;
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ error: "Noto'g'ri sinf ID" });

    let { title, description, cefr_level, skill, question_count, due_at, max_attempts } = req.body;
    title = sanitizeText(title || "", 150);
    description = sanitizeText(description || "", 1000);
    if (title.length < 3) return res.status(400).json({ error: "Sarlavha 3–150 belgi bo'lishi kerak" });
    if (!ASSIGN_LEVELS.includes(cefr_level)) return res.status(400).json({ error: "Noto'g'ri CEFR daraja" });
    skill = ASSIGN_SKILLS.includes(skill) ? skill : "mixed";
    question_count = parseInt(question_count, 10);
    if (isNaN(question_count) || question_count < 1 || question_count > 50) return res.status(400).json({ error: "Savol soni 1–50 oralig'ida bo'lishi kerak" });
    max_attempts = parseInt(max_attempts, 10);
    if (isNaN(max_attempts) || max_attempts < 1 || max_attempts > 5) max_attempts = 1;

    let dueAt = null;
    if (due_at) {
      const date = new Date(due_at);
      if (isNaN(date.getTime())) return res.status(400).json({ error: "Muddat sanasi noto'g'ri" });
      dueAt = date;
    }

    try {
      const result = await service.createAssignment({
        req, teacherId, classId, title, description, cefrLevel: cefr_level,
        skill, questionCount: question_count, dueAt, maxAttempts: max_attempts,
      });
      if (result.type === "class_not_found") return res.status(404).json({ error: "Sinf topilmadi" });
      if (result.type === "limit_reached") return res.status(402).json(result.error);
      if (result.type === "questions_unavailable") {
        return res.status(400).json({ error: "Yetarli savol yo'q (kerak: " + question_count + ", mavjud: " + result.available + "). Daraja yoki skill'ni o'zgartiring." });
      }
      return res.status(201).json({ success: true, assignment: result.assignment });
    } catch (err) {
      console.error("Topshiriq yaratish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { createAssignment };
}

module.exports = { createTeacherAssignmentCreateController };
