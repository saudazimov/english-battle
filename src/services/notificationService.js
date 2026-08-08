// ============ BILDIRISHNOMA YARATISH ============
function createNotificationService({ pool, logger, reportStatus = false }) {
  return async function createNotification(userId, type, message, queryable = pool) {
    try {
      await queryable.query(
        "INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)",
        [userId, type, message]
      );
      return reportStatus ? true : undefined;
    } catch (error) {
      logger.error("Bildirishnoma yaratish xatosi:", error.message);
      return reportStatus ? false : undefined;
    }
  };
}

module.exports = { createNotificationService };
