async function getFriendStatus(pool, viewerId, userId) {
  if (String(viewerId) === String(userId)) {
    return "self";
  }

  try {
    const result = await pool.query(
      `SELECT requester_id, receiver_id, status FROM friendships
           WHERE (requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1)
           LIMIT 1`,
      [viewerId, userId]
    );

    if (result.rows.length === 0) return "none";

    const friendship = result.rows[0];
    if (friendship.status === "accepted") return "friends";
    if (friendship.status === "pending") {
      return String(friendship.requester_id) === String(viewerId)
        ? "pending_sent"
        : "pending_received";
    }
  } catch (error) {
    return "none";
  }

  return "none";
}

async function getMutualFriends(pool, viewerId, userId, friendStatus) {
  if (friendStatus === "self") {
    return { mutualFriends: [], mutualCount: 0 };
  }

  try {
    const result = await pool.query(
      `WITH viewer_friends AS (
             SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
             FROM friendships
             WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'
           ),
           target_friends AS (
             SELECT CASE WHEN requester_id = $2 THEN receiver_id ELSE requester_id END AS fid
             FROM friendships
             WHERE (requester_id = $2 OR receiver_id = $2) AND status = 'accepted'
           )
           SELECT u.id, u.first_name, u.last_name, u.profile_picture, u.rating
           FROM viewer_friends vf
           JOIN target_friends tf ON vf.fid = tf.fid
           JOIN users u ON u.id = vf.fid
           ORDER BY u.rating DESC`,
      [viewerId, userId]
    );

    return {
      mutualFriends: result.rows.slice(0, 8),
      mutualCount: result.rows.length,
    };
  } catch (error) {
    return { mutualFriends: [], mutualCount: 0 };
  }
}

const FAVORITE_MODE_LABELS = Object.freeze({
  ranked: "1v1 Ranked",
  casual: "1v1 Casual",
  duo: "Duo (2v2)",
  squad: "Squad (4v4)",
  school: "School Battle",
});

function getFavoriteModeLabel(mode) {
  return FAVORITE_MODE_LABELS[mode] || "Hali o'yin yo'q";
}

function createUserPublicProfileService({ pool }) {
  return {
    async getProfile(userId, viewerId) {
      const userResult = await pool.query(
        `SELECT id, first_name, last_name, username, bio, cefr_level, rating, xp, coins,
              current_streak, longest_streak, win_streak, best_win_streak,
              region, district, village, school, profile_picture
       FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) return null;

      const user = userResult.rows[0];
      const statsResult = await pool.query(
        `SELECT
         COUNT(*) AS total_battles,
         COUNT(*) FILTER (WHERE outcome = 'win') AS wins,
         COUNT(*) FILTER (WHERE outcome = 'lose') AS loses,
         COUNT(*) FILTER (WHERE outcome = 'draw') AS draws,
         COALESCE(SUM(my_score), 0) AS total_correct,
         COALESCE(SUM(opponent_score), 0) AS opp_total,
         (SELECT bh.mode
          FROM battle_history bh
          WHERE bh.user_id = $1 AND bh.mode IS NOT NULL
          GROUP BY bh.mode
          ORDER BY COUNT(*) DESC, MAX(bh.played_at) DESC, bh.mode ASC
          LIMIT 1) AS favorite_mode
       FROM battle_history WHERE user_id = $1`,
        [userId]
      );

      const stats = statsResult.rows[0];
      const totalBattles = parseInt(stats.total_battles);
      const wins = parseInt(stats.wins);
      const winRate = totalBattles > 0
        ? Math.round((wins / totalBattles) * 100)
        : 0;
      const friendStatus = await getFriendStatus(pool, viewerId, userId);
      const { mutualFriends, mutualCount } = await getMutualFriends(
        pool,
        viewerId,
        userId,
        friendStatus
      );

      if (friendStatus !== "self" && friendStatus !== "friends") {
        delete user.district;
        delete user.village;
        delete user.school;
      }

      return {
        user: user,
        friendStatus: friendStatus,
        mutual_friends: mutualFriends,
        mutual_count: mutualCount,
        stats: {
          total_battles: totalBattles,
          wins: wins,
          loses: parseInt(stats.loses),
          draws: parseInt(stats.draws),
          win_rate: winRate,
          total_correct: parseInt(stats.total_correct),
          favorite_mode: stats.favorite_mode || null,
          favorite_mode_label: getFavoriteModeLabel(stats.favorite_mode),
        },
      };
    },
  };
}

module.exports = { createUserPublicProfileService };
