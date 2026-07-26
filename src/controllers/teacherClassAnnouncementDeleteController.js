function createTeacherClassAnnouncementDeleteController({ pool, ownedActiveClass, io, logger = console }) {
  async function remove(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      const announcementId = parseInt(req.params.announcementId, 10);
      if (!Number.isInteger(classId) || !Number.isInteger(announcementId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const removed = await pool.query(
        "DELETE FROM class_announcements WHERE id=$1 AND class_id=$2 AND teacher_id=$3 RETURNING id",
        [announcementId, classId, req.user.id]
      );
      if (!removed.rows.length) {
        return res.status(404).json({ error: "E'lon topilmadi" });
      }
      io.to("class_" + String(classId)).emit("classAnnouncementUpdated", { classId });
      return res.json({ success: true });
    } catch (error) {
      logger.error("E'lon o'chirish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { remove };
}

module.exports = { createTeacherClassAnnouncementDeleteController };
