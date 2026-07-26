function createFriendListController({ pool, onlineUsers, logger = console }) {
  async function list(req, res) {
    try {
      const userId = req.user.id;
      const result = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture
       FROM friendships f
       JOIN users u ON (u.id = f.requester_id OR u.id = f.receiver_id)
       WHERE (f.requester_id = $1 OR f.receiver_id = $1)
         AND f.status = 'accepted'
         AND u.id != $1
       ORDER BY u.rating DESC`,
        [userId]
      );
      const friendsWithStatus = result.rows.map((friend) => ({
        ...friend,
        isOnline: !!onlineUsers[String(friend.id)],
      }));

      return res.json({ friends: friendsWithStatus });
    } catch (error) {
      logger.error("Do'stlar xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createFriendListController };
