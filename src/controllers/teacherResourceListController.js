function createTeacherResourceListController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const teacherId = req.user.id;
      const result = await pool.query(
        `SELECT r.id, r.title, r.description, r.file_path, r.file_name, r.file_type,
              r.file_size, r.cefr_level, r.skill, r.class_id, r.download_count, r.created_at,
              c.name AS class_name
       FROM teacher_resources r
       LEFT JOIN classes c ON c.id = r.class_id
       WHERE r.teacher_id = $1
       ORDER BY r.created_at DESC`,
        [teacherId]
      );

      const total = result.rows.length;
      const totalSize = result.rows.reduce((sum, resource) => sum + (resource.file_size || 0), 0);
      const totalDownloads = result.rows.reduce(
        (sum, resource) => sum + (resource.download_count || 0),
        0
      );
      const byType = {};
      result.rows.forEach((resource) => {
        byType[resource.file_type] = (byType[resource.file_type] || 0) + 1;
      });

      return res.json({
        resources: result.rows,
        stats: {
          total,
          total_size: totalSize,
          total_downloads: totalDownloads,
          by_type: byType,
        },
      });
    } catch (error) {
      logger.error("Resurslar ro'yxati xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createTeacherResourceListController };
