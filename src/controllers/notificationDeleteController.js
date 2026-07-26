function createNotificationDeleteController({ pool, logger = console }) {
  async function remove(req, res) {
    try {
      const userId = req.user.id;
      const notificationId = parseInt(req.params.notifId, 10);
      if (isNaN(notificationId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      const result = await pool.query(
        "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
        [notificationId, userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Topilmadi" });
      }
      return res.json({ message: "O'chirildi", id: notificationId });
    } catch (error) {
      logger.error("Bildirishnoma o'chirish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { remove };
}

module.exports = { createNotificationDeleteController };
