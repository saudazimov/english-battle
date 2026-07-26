function createNotificationClearController({ pool, logger = console }) {
  async function clearAll(req, res) {
    try {
      const userId = req.user.id;
      await pool.query(
        "DELETE FROM notifications WHERE user_id = $1",
        [userId]
      );
      return res.json({ message: "Barcha xabarlar o'chirildi" });
    } catch (error) {
      logger.error("Bildirishnomalarni tozalash xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { clearAll };
}

module.exports = { createNotificationClearController };
