function createAdminUserMessagesController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const userId = parseInt(req.params.id);
      if (!userId) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      const result = await pool.query(
        "SELECT message, room_id, created_at FROM chat_messages WHERE sender_id = $1 ORDER BY created_at DESC LIMIT 50",
        [userId]
      );
      return res.json({ messages: result.rows });
    } catch (error) {
      logger.error("Foydalanuvchi xabarlari xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createAdminUserMessagesController };
