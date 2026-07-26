function createFriendSuggestedController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const userId = req.user.id;

      const meResult = await pool.query(
        "SELECT region, district, school, cefr_level, rating FROM users WHERE id = $1",
        [userId]
      );
      if (meResult.rows.length === 0) {
        return res.status(404).json({ error: "Topilmadi" });
      }
      const me = meResult.rows[0];

      const relationshipsResult = await pool.query(
        `SELECT requester_id, receiver_id FROM friendships
       WHERE requester_id = $1 OR receiver_id = $1`,
        [userId]
      );
      const excludeIds = new Set([parseInt(userId)]);
      relationshipsResult.rows.forEach((relationship) => {
        excludeIds.add(relationship.requester_id);
        excludeIds.add(relationship.receiver_id);
      });

      const usersResult = await pool.query(
        `SELECT id, first_name, last_name, cefr_level, rating, region, district, school
       FROM users WHERE id != $1`,
        [userId]
      );

      const scored = [];
      usersResult.rows.forEach((user) => {
        if (excludeIds.has(user.id)) return;

        let score = 0;
        const reasons = [];

        if (user.school && me.school && user.district && me.district &&
            user.school === me.school && user.district === me.district) {
          score += 100;
          reasons.push("Maktabdosh");
        } else if (user.district && me.district && user.district === me.district) {
          score += 50;
          reasons.push("Bir tumandan");
        } else if (user.region && me.region && user.region === me.region) {
          score += 20;
          reasons.push("Bir viloyatdan");
        }

        if (user.cefr_level === me.cefr_level) {
          score += 30;
          reasons.push(user.cefr_level + " daraja");
        }

        if (Math.abs((user.rating || 1000) - (me.rating || 1000)) <= 200) {
          score += 15;
        }

        if (score > 0) {
          scored.push({
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            cefr_level: user.cefr_level,
            rating: user.rating,
            score: score,
            reason: reasons[0] || "Tavsiya",
          });
        }
      });

      scored.sort((a, b) => b.score - a.score);
      return res.json({ suggested: scored.slice(0, 6) });
    } catch (error) {
      logger.error("Suggested xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createFriendSuggestedController };
