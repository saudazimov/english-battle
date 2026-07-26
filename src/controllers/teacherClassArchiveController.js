function createTeacherClassArchiveController({ pool, logAudit, logger = console }) {
  async function archive(req, res) {
    try {
      const teacherId = req.user.id;
      const classId = parseInt(req.params.classId);
      if (!classId) return res.status(400).json({ error: "Noto'g'ri ID" });

      const own = await pool.query(
        "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
        [classId, teacherId]
      );
      if (own.rows.length === 0) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }

      await pool.query(
        "UPDATE classes SET archived_at = NOW() WHERE id = $1",
        [classId]
      );

      if (typeof logAudit === "function") {
        logAudit(req, "class_archived", { entityType: "class", entityId: classId });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error("Sinf arxivlash xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { archive };
}

module.exports = { createTeacherClassArchiveController };
