function createFriendRemoveController({ pool, io, onlineUsers, logger = console }) {
  async function remove(req, res) {
    try {
      const userId = req.user.id;
      const { friendId } = req.body;
      if (!friendId) {
        return res.status(400).json({ error: "friendId kerak" });
      }

      await pool.query(
        `DELETE FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
        [userId, friendId]
      );

      const friendSocket = onlineUsers[String(friendId)];
      if (friendSocket) {
        io.to(friendSocket).emit("friendRemoved", { byUserId: userId });
      }

      return res.json({ message: "Do'st o'chirildi" });
    } catch (error) {
      logger.error("Do'st o'chirish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { remove };
}

module.exports = { createFriendRemoveController };
