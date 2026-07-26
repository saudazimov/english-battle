function createFriendWinsController({ pool, logger = console }) {
  async function getWins(req, res) {
    try {
      const userId = req.user.id;

      const friendsResult = await pool.query(
        `SELECT requester_id, receiver_id FROM friendships
       WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
        [userId]
      );
      const friendIds = friendsResult.rows.map((friendship) =>
        String(friendship.requester_id) === String(userId)
          ? friendship.receiver_id
          : friendship.requester_id
      );

      if (friendIds.length === 0) {
        return res.json({ wins: 0, total: 0 });
      }

      const winsResult = await pool.query(
        `SELECT
         COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
         COUNT(*) AS total
       FROM battle_history
       WHERE user_id = $1 AND opponent_id = ANY($2)`,
        [userId, friendIds]
      );

      return res.json({
        wins: parseInt(winsResult.rows[0].wins) || 0,
        total: parseInt(winsResult.rows[0].total) || 0,
      });
    } catch (error) {
      logger.error("Wins vs friends xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getWins };
}

module.exports = { createFriendWinsController };
