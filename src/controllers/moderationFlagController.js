function createFlagReportHandler({ pool, logger }) {
  return async function reportFlag(req, res) {
    try {
      const reporterId = req.user.id;
      const { entity_type, entity_id, reason, comment } = req.body;

      if (!entity_type || !entity_id || !reason) {
        return res.status(400).json({ error: "Ma'lumot yetishmaydi" });
      }
      const validTypes = ["question", "user"];
      if (validTypes.indexOf(entity_type) === -1) {
        return res.status(400).json({ error: "Noto'g'ri tur" });
      }
      const validReasons = [
        "incorrect",
        "inappropriate",
        "spam",
        "offensive",
        "cheating",
        "other",
      ];
      if (validReasons.indexOf(reason) === -1) {
        return res.status(400).json({ error: "Noto'g'ri sabab" });
      }
      if (entity_type === "user" && parseInt(entity_id) === reporterId) {
        return res
          .status(400)
          .json({ error: "O'zingizga shikoyat qila olmaysiz" });
      }

      const existing = await pool.query(
        "SELECT id FROM flags WHERE reporter_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'pending'",
        [reporterId, entity_type, parseInt(entity_id)]
      );
      if (existing.rows.length > 0) {
        return res
          .status(409)
          .json({ error: "Siz bu haqda allaqachon shikoyat qilgansiz" });
      }

      const contextRoom =
        (req.body.context_room_id || "").trim().slice(0, 120) || null;
      await pool.query(
        "INSERT INTO flags (reporter_id, entity_type, entity_id, reason, comment, context_room_id) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          reporterId,
          entity_type,
          parseInt(entity_id),
          reason,
          (comment || "").trim().slice(0, 500) || null,
          contextRoom,
        ]
      );
      res.json({ message: "Shikoyat yuborildi. Rahmat!" });
    } catch (error) {
      logger.error("Shikoyat xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createAdminFlagListHandler({ pool, logger }) {
  return async function listAdminFlags(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;
      const status = (req.query.status || "pending").trim();
      const conds = [];
      const params = [];
      let p = 0;
      if (status && status !== "all") {
        p++;
        conds.push("f.status = $" + p);
        params.push(status);
      }
      const whereClause = conds.length
        ? "WHERE " + conds.join(" AND ")
        : "";
      const countResult = await pool.query(
        "SELECT COUNT(*) AS total FROM flags f " + whereClause,
        params
      );
      const total = parseInt(countResult.rows[0].total);
      const dataParams = params.slice();
      dataParams.push(limit);
      const li = dataParams.length;
      dataParams.push(offset);
      const oi = dataParams.length;

      const dataResult = await pool.query(
        "SELECT f.id, f.entity_type, f.entity_id, f.reason, f.comment, f.status, " +
          "f.reviewed_by, f.reviewed_at, f.created_at, f.reporter_id, f.context_room_id, " +
          "r.first_name AS reporter_first, r.last_name AS reporter_last, " +
          "q.question_text AS question_text, " +
          "tu.first_name AS target_first, tu.last_name AS target_last " +
          "FROM flags f " +
          "LEFT JOIN users r ON r.id = f.reporter_id " +
          "LEFT JOIN questions q ON (f.entity_type = 'question' AND q.id = f.entity_id) " +
          "LEFT JOIN users tu ON (f.entity_type = 'user' AND tu.id = f.entity_id) " +
          whereClause +
          " ORDER BY f.created_at DESC LIMIT $" +
          li +
          " OFFSET $" +
          oi,
        dataParams
      );
      res.json({
        flags: dataResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error("Flags ro'yxat xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createAdminFlagResolveHandler({ pool, logAudit, logger }) {
  return async function resolveAdminFlag(req, res) {
    try {
      const { id, action } = req.body;
      if (!id || !action) {
        return res.status(400).json({ error: "id va action kerak" });
      }
      const newStatus = action === "resolve" ? "resolved" : "dismissed";
      const adminName = req.admin && req.admin.name ? req.admin.name : "Admin";
      const result = await pool.query(
        "UPDATE flags SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3 RETURNING entity_type, entity_id",
        [newStatus, adminName, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Shikoyat topilmadi" });
      }
      const flag = result.rows[0];
      await logAudit(req, "flag_" + newStatus, {
        entityType: flag.entity_type,
        entityId: flag.entity_id,
        details:
          "Shikoyat " +
          (newStatus === "resolved" ? "tasdiqlandi" : "rad etildi"),
      });
      res.json({
        message:
          newStatus === "resolved"
            ? "Shikoyat hal qilindi"
            : "Shikoyat rad etildi",
      });
    } catch (error) {
      logger.error("Flag resolve xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createModerationFlagController(dependencies) {
  const shared = { ...dependencies, logger: dependencies.logger || console };
  return {
    report: createFlagReportHandler(shared),
    list: createAdminFlagListHandler(shared),
    resolve: createAdminFlagResolveHandler(shared),
  };
}

module.exports = { createModerationFlagController };
