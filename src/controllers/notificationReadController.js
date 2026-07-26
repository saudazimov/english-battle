function createNotificationReadController({ pool, logger = console }) {
  async function markAllRead(req, res) {
    try {
      const userId = req.user.id;
      await pool.query(
        "UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE",
        [userId]
      );
      return res.json({ message: "O'qilgan deb belgilandi" });
    } catch (error) {
      logger.error("Bildirishnoma o'qish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { markAllRead };
}

module.exports = { createNotificationReadController };
