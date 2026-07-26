// ===== AUDIT LOG HELPER =====
// Admin amallarini audit_logs jadvaliga yozadi (kim, nima, qachon)
function createAuditLogService({ pool, clientIp, logger }) {
  return async function logAudit(req, action, opts) {
    opts = opts || {};
    try {
      const adminName = (req.admin && req.admin.name) ? req.admin.name : "Admin";
      const ip = clientIp(req);
      await pool.query(
        `INSERT INTO audit_logs (admin_name, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          adminName,
          action,
          opts.entityType || null,
          opts.entityId ? String(opts.entityId) : null,
          opts.details || null,
          String(ip).slice(0, 60),
        ]
      );
    } catch (error) {
      logger.error("Audit log xatosi:", error.message);
    }
  };
}

module.exports = { createAuditLogService };
