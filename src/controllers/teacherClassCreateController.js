function generateClassCode(random) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(random() * chars.length));
  }
  return code;
}

function createTeacherClassCreateController({
  pool,
  premium,
  sanitizeText,
  logAudit,
  random = Math.random,
  logger = console,
}) {
  async function generateUniqueClassCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateClassCode(random);
      const existing = await pool.query("SELECT id FROM classes WHERE join_code = $1", [code]);
      if (existing.rows.length === 0) return code;
    }
    throw new Error("Join code yaratib bo'lmadi, qayta urinib ko'ring");
  }

  async function create(req, res) {
    try {
      const teacherId = req.user.id;
      const { name, description } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({ error: "Sinf nomi majburiy" });
      }
      if (name.trim().length > 120) {
        return res.status(400).json({ error: "Sinf nomi juda uzun (120 belgidan oshmasin)" });
      }
      const safeName = sanitizeText(name, 120);
      const safeDescription = sanitizeText(description, 500);

      const classLimit = await premium.checkTeacherLimit(teacherId, "classes");
      if (!classLimit.allowed) {
        await logAudit(req, "teacher_limit_blocked_class", {
          entityType: "class", entityId: teacherId,
          details: "teacher=" + teacherId + " count=" + classLimit.current + " limit=" + classLimit.limit + " plan=free",
        }).catch(() => {});
        return res.status(402).json(premium.teacherLimitError("classes"));
      }

      const schoolId = null;
      const joinCode = await generateUniqueClassCode();
      const newClass = await pool.query(
        `INSERT INTO classes (teacher_id, school_id, name, description, join_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, teacher_id, school_id, name, description, join_code, created_at, archived_at`,
        [teacherId, schoolId, safeName, safeDescription || null, joinCode]
      );

      return res.status(201).json({
        message: "Sinf yaratildi",
        class: newClass.rows[0],
      });
    } catch (error) {
      logger.error("Sinf yaratish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { create };
}

module.exports = { createTeacherClassCreateController };
