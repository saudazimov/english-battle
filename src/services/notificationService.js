// ============ BILDIRISHNOMA YARATISH ============
function createNotificationService({ pool, logger }) {
  return async function createNotification(userId, type, message) {
    try {
      await pool.query(
        "INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)",
        [userId, type, message]
      );
    } catch (error) {
      logger.error("Bildirishnoma yaratish xatosi:", error.message);
    }
  };
}

module.exports = { createNotificationService };
