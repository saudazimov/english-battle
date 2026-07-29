const {
  createTeacherExamCreateService,
} = require("../services/teacherExamCreateService");

const EXAM_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const EXAM_SKILLS = ["mixed", "grammar", "vocabulary", "reading", "listening", "speaking", "writing"];

function createTeacherExamCreateController({ pool, sanitizeText, logAudit }) {
  const service = createTeacherExamCreateService({ pool, logAudit });

  async function createExam(req, res) {
    const teacherId = req.user.id;
    let { class_id, title, description, cefr_level, skill, question_count,
      duration_minutes, pass_percent, max_attempts, starts_at, ends_at } = req.body;

    title = sanitizeText(title || "", 200);
    description = sanitizeText(description || "", 1000);
    if (title.length < 3) return res.status(400).json({ error: "Sarlavha 3–200 belgi bo'lishi kerak" });
    if (!EXAM_LEVELS.includes(cefr_level)) return res.status(400).json({ error: "Noto'g'ri CEFR daraja" });
    skill = EXAM_SKILLS.includes(skill) ? skill : "mixed";
    question_count = parseInt(question_count, 10);
    if (isNaN(question_count) || question_count < 1 || question_count > 50) return res.status(400).json({ error: "Savol soni 1–50 oralig'ida" });
    duration_minutes = parseInt(duration_minutes, 10);
    if (isNaN(duration_minutes) || duration_minutes < 5 || duration_minutes > 180) return res.status(400).json({ error: "Davomiylik 5–180 daqiqa oralig'ida" });
    pass_percent = parseInt(pass_percent, 10);
    if (isNaN(pass_percent) || pass_percent < 0 || pass_percent > 100) pass_percent = 60;
    max_attempts = parseInt(max_attempts, 10);
    if (isNaN(max_attempts) || max_attempts < 1 || max_attempts > 5) max_attempts = 1;

    let startsAt = null;
    let endsAt = null;
    if (starts_at) { const date = new Date(starts_at); if (!isNaN(date.getTime())) startsAt = date; }
    if (ends_at) { const date = new Date(ends_at); if (!isNaN(date.getTime())) endsAt = date; }
    const classId = class_id ? parseInt(class_id, 10) : null;

    try {
      const result = await service.createExam({
        req, teacherId, classId, title, description, cefrLevel: cefr_level,
        skill, questionCount: question_count, durationMinutes: duration_minutes,
        passPercent: pass_percent, maxAttempts: max_attempts, startsAt, endsAt,
      });
      if (result.type === "class_not_found") return res.status(404).json({ error: "Sinf topilmadi" });
      if (result.type === "questions_unavailable") {
        return res.status(400).json({ error: "Bu daraja/ko'nikma bo'yicha yetarli savol yo'q. Avval savollar qo'shing." });
      }
      return res.json({ success: true, id: result.examId, question_count: result.questionCount });
    } catch (err) {
      console.error("Imtihon yaratish xatosi:", err.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { createExam };
}

module.exports = { createTeacherExamCreateController };
