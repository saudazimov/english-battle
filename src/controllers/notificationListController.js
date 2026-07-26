function createNotificationListController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const userId = req.user.id;
      const result = await pool.query(
        `SELECT id, type, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
        [userId]
      );
      const unread = result.rows.filter((notification) => !notification.is_read).length;
      return res.json({ notifications: result.rows, unread });
    } catch (error) {
      logger.error("Bildirishnoma olish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createNotificationListController };
