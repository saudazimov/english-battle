function createAdminRoomMessagesController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const roomId = (req.query.room || "").trim();
      if (!roomId) {
        return res.status(400).json({ error: "Room ID kerak" });
      }
      const result = await pool.query(
        "SELECT sender_id, sender_name, message, created_at FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 200",
        [roomId]
      );
      return res.json({ messages: result.rows });
    } catch (error) {
      logger.error("Room xabarlari xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createAdminRoomMessagesController };
