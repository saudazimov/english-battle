function createFriendRequestsController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const userId = req.user.id;
      const result = await pool.query(
        `SELECT f.id AS friendship_id, u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.receiver_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
        [userId]
      );
      return res.json({ requests: result.rows });
    } catch (error) {
      logger.error("So'rovlar xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createFriendRequestsController };
