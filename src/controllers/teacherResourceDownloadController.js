function createTeacherResourceDownloadController({ pool, resourceAbsolutePath, logger = console }) {
  async function download(req, res) {
    try {
      const teacherId = req.user.id;
      const resourceId = parseInt(req.params.id, 10);
      if (isNaN(resourceId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }

      const result = await pool.query(
        "SELECT file_path, file_name FROM teacher_resources WHERE id = $1 AND teacher_id = $2",
        [resourceId, teacherId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Resurs topilmadi" });
      }

      pool.query(
        "UPDATE teacher_resources SET download_count = download_count + 1 WHERE id = $1",
        [resourceId]
      ).catch(() => {});

      const resource = result.rows[0];
      const absolutePath = resourceAbsolutePath(resource.file_path);
      res.download(absolutePath, resource.file_name);
    } catch (error) {
      logger.error("Resurs yuklab olish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { download };
}

module.exports = { createTeacherResourceDownloadController };
