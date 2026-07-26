function createAdminAuditLogListController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        var page = Math.max(1, parseInt(req.query.page) || 1);
        var limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        var offset = (page - 1) * limit;

        var action = (req.query.action || "").trim();
        var conds = [];
        var params = [];
        var p = 0;
        if (action) {
          p++;
          conds.push("action = $" + p);
          params.push(action);
        }
        var whereClause = conds.length ? "WHERE " + conds.join(" AND ") : "";

        var countResult = await pool.query(
          "SELECT COUNT(*) AS total FROM audit_logs " + whereClause,
          params
        );
        var total = parseInt(countResult.rows[0].total);

        var dataParams = params.slice();
        dataParams.push(limit);
        var li = dataParams.length;
        dataParams.push(offset);
        var oi = dataParams.length;

        var dataResult = await pool.query(
          "SELECT id, admin_name, action, entity_type, entity_id, details, created_at FROM audit_logs " +
            whereClause +
            " ORDER BY id DESC LIMIT $" +
            li +
            " OFFSET $" +
            oi,
          dataParams
        );

        res.json({
          logs: dataResult.rows,
          pagination: {
            page: page,
            limit: limit,
            total: total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error("Audit logs xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminAuditLogListController };
