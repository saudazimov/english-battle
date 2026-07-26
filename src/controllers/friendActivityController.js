function createFriendActivityController({ pool, logger = console }) {
  async function list(req, res) {
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
        return res.json({ activities: [] });
      }

      const battlesResult = await pool.query(
        `SELECT bh.user_id, bh.opponent_name, bh.my_score, bh.opponent_score,
              bh.outcome, bh.rating_change, bh.played_at,
              u.first_name, u.last_name, u.rating, u.profile_picture
       FROM battle_history bh
       JOIN users u ON u.id = bh.user_id
       WHERE bh.user_id = ANY($1)
       ORDER BY bh.played_at DESC
       LIMIT 10`,
        [friendIds]
      );

      const activities = battlesResult.rows.map((battle) => ({
        type: "battle",
        friendId: battle.user_id,
        friendName: battle.first_name + " " + battle.last_name,
        friendFirst: battle.first_name,
        friendPic: battle.profile_picture,
        outcome: battle.outcome,
        myScore: battle.my_score,
        oppScore: battle.opponent_score,
        opponentName: battle.opponent_name,
        ratingChange: battle.rating_change,
        rating: battle.rating,
        time: battle.played_at,
      }));

      return res.json({ activities: activities });
    } catch (error) {
      logger.error("Faoliyat xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createFriendActivityController };
