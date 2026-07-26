function createTeacherClassAnnouncementsListController({ pool, ownedActiveClass, logger = console }) {
  async function list(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      if (!Number.isInteger(classId)) {
        return res.status(400).json({ error: "Noto'g'ri sinf ID" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const rows = await pool.query(
        `SELECT id, title, body, is_pinned, created_at, updated_at
         FROM class_announcements WHERE class_id=$1
        ORDER BY is_pinned DESC, created_at DESC`, [classId]
      );
      return res.json({ announcements: rows.rows });
    } catch (error) {
      logger.error("Sinf e'lonlari xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createTeacherClassAnnouncementsListController };
