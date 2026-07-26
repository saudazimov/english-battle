function createTeacherClassAnnouncementUpdateController({
  pool,
  sanitizeText,
  ownedActiveClass,
  io,
  logger = console,
}) {
  async function update(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      const announcementId = parseInt(req.params.announcementId, 10);
      const title = sanitizeText(req.body.title || "", 160);
      const body = sanitizeText(req.body.body || "", 2000);
      if (!Number.isInteger(classId) || !Number.isInteger(announcementId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      if (!title || !body) {
        return res.status(400).json({ error: "Sarlavha va e'lon matnini kiriting" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const updated = await pool.query(
        `UPDATE class_announcements SET title=$1, body=$2, is_pinned=$3, updated_at=NOW()
        WHERE id=$4 AND class_id=$5 AND teacher_id=$6
        RETURNING id, title, body, is_pinned, created_at, updated_at`,
        [title, body, req.body.is_pinned === true, announcementId, classId, req.user.id]
      );
      if (!updated.rows.length) {
        return res.status(404).json({ error: "E'lon topilmadi" });
      }
      io.to("class_" + String(classId)).emit("classAnnouncementUpdated", { classId });
      return res.json({ announcement: updated.rows[0] });
    } catch (error) {
      logger.error("E'lon tahrirlash xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { update };
}

module.exports = { createTeacherClassAnnouncementUpdateController };
