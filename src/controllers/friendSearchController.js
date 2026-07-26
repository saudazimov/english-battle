function createFriendSearchController({ pool, logger = console }) {
  async function search(req, res) {
    try {
      const { q } = req.query;
      const userId = req.user.id;
      if (!q || q.trim() === "") {
        return res.json({ results: [] });
      }

      const searchTerm = "%" + q.trim() + "%";
      const result = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.username, u.cefr_level,
              u.rating, u.profile_picture,
              (SELECT f.status FROM friendships f
               WHERE (f.requester_id = $2 AND f.receiver_id = u.id)
                  OR (f.requester_id = u.id AND f.receiver_id = $2)
               LIMIT 1) AS relation_status
       FROM users u
       WHERE (u.first_name ILIKE $1
              OR u.last_name ILIKE $1
              OR u.username ILIKE $1
              OR (u.first_name || ' ' || u.last_name) ILIKE $1
              OR (u.last_name || ' ' || u.first_name) ILIKE $1)
         AND u.id != $2
         AND COALESCE(u.is_banned, false) = false
       ORDER BY u.rating DESC, u.id ASC
       LIMIT 20`,
        [searchTerm, userId || 0]
      );

      const enriched = result.rows.map((user) => {
        const friendStatus = user.relation_status === "accepted"
          ? "friend"
          : (user.relation_status === "pending" ? "pending" : "none");
        const { relation_status, ...safeUser } = user;
        return { ...safeUser, friendStatus };
      });

      return res.json({ results: enriched });
    } catch (error) {
      logger.error("Do'st qidirish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { search };
}

module.exports = { createFriendSearchController };
