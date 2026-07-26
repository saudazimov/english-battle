function createTeacherResourceUploadController({
  pool,
  uploadedContentMatches,
  removeUploadedFile,
  sanitizeText,
  detectFileType,
  pathModule,
  logAudit,
  logger = console,
}) {
  async function upload(req, res) {
    try {
      const teacherId = req.user.id;
      if (!req.file) {
        return res.status(400).json({ error: "Fayl yuklanmadi" });
      }
      if (!uploadedContentMatches(req.file)) {
        removeUploadedFile(req.file);
        return res.status(400).json({ error: "Fayl tarkibi uning turiga mos emas" });
      }

      const title = sanitizeText((req.body.title || "").trim() || req.file.originalname, 200);
      const description = sanitizeText(req.body.description || "", 1000);
      const cefrLevel = (req.body.cefr_level || "").trim() || null;
      const skill = (req.body.skill || "").trim() || null;
      const classId = req.body.class_id ? parseInt(req.body.class_id, 10) : null;
      if (req.body.class_id && !Number.isInteger(classId)) {
        removeUploadedFile(req.file);
        return res.status(400).json({ error: "Sinf ID noto'g'ri" });
      }
      if (classId) {
        const ownsClass = await pool.query(
          "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
          [classId, teacherId]
        );
        if (ownsClass.rows.length === 0) {
          removeUploadedFile(req.file);
          return res.status(403).json({ error: "Bu sinf sizga tegishli emas" });
        }
      }

      const filePath = req.file.filename;
      const fileType = detectFileType(req.file.mimetype);
      const result = await pool.query(
        `INSERT INTO teacher_resources
        (teacher_id, title, description, file_path, file_name, file_type, file_size, cefr_level, skill, class_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, created_at`,
        [
          teacherId,
          title,
          description,
          filePath,
          pathModule.basename(req.file.originalname).replace(/[\r\n]/g, ""),
          fileType,
          req.file.size,
          cefrLevel,
          skill,
          classId,
        ]
      );

      if (typeof logAudit === "function") {
        logAudit(req, "resource_uploaded", {
          entityType: "resource",
          entityId: result.rows[0].id,
        });
      }

      return res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
      removeUploadedFile(req.file);
      logger.error("Resurs yuklash xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { upload };
}

module.exports = { createTeacherResourceUploadController };
