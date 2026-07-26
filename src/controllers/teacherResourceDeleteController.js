function createTeacherResourceDeleteController({
  pool,
  fileSystem,
  resourceAbsolutePath,
  logAudit,
  logger = console,
}) {
  async function remove(req, res) {
    try {
      const teacherId = req.user.id;
      const resourceId = parseInt(req.params.id, 10);
      if (isNaN(resourceId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }

      const result = await pool.query(
        "SELECT file_path FROM teacher_resources WHERE id = $1 AND teacher_id = $2",
        [resourceId, teacherId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Resurs topilmadi" });
      }

      await pool.query("DELETE FROM teacher_resources WHERE id = $1", [resourceId]);

      try {
        const absolutePath = resourceAbsolutePath(result.rows[0].file_path);
        if (fileSystem.existsSync(absolutePath)) fileSystem.unlinkSync(absolutePath);
      } catch (error) {
        // Fayl allaqachon yo'q bo'lishi mumkin.
      }

      if (typeof logAudit === "function") {
        logAudit(req, "resource_deleted", { entityType: "resource", entityId: resourceId });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error("Resurs o'chirish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { remove };
}

module.exports = { createTeacherResourceDeleteController };
