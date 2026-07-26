function createTeacherClassAnnouncementCreateController({
  pool,
  sanitizeText,
  ownedActiveClass,
  io,
  logger = console,
}) {
  async function create(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      const title = sanitizeText(req.body.title || "", 160);
      const body = sanitizeText(req.body.body || "", 2000);
      if (!Number.isInteger(classId)) {
        return res.status(400).json({ error: "Noto'g'ri sinf ID" });
      }
      if (!title || !body) {
        return res.status(400).json({ error: "Sarlavha va e'lon matnini kiriting" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const inserted = await pool.query(
        `INSERT INTO class_announcements (class_id, teacher_id, title, body, is_pinned)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, title, body, is_pinned, created_at, updated_at`,
        [classId, req.user.id, title, body, req.body.is_pinned === true]
      );
      io.to("class_" + String(classId)).emit("classAnnouncementCreated", { classId });
      return res.status(201).json({ announcement: inserted.rows[0] });
    } catch (error) {
      logger.error("E'lon yaratish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { create };
}

module.exports = { createTeacherClassAnnouncementCreateController };
