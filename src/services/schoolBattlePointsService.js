// ===== SCHOOL BATTLE: maktabga ochko yig'ish =====
function createSchoolBattlePointsService({ pool, currentSeason, logger }) {
  return async function awardSchoolPoints(userId, points, source) {
    if (!userId || !points || points <= 0) return;
    try {
      const userResult = await pool.query(
        "SELECT region, district, school FROM users WHERE id = $1",
        [userId]
      );
      if (!userResult.rows[0] || !userResult.rows[0].school) return;
      const user = userResult.rows[0];
      await pool.query(
        `INSERT INTO school_battle_points (user_id, region, district, school, points, source, season)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, user.region, user.district, user.school, points, source, currentSeason()]
      );
      logger.log("School ochko: +" + points + " (" + source + ") -> " + user.school + " [user " + userId + "]");
    } catch (error) {
      logger.error("School Battle ochko xatosi:", error.message);
    }
  };
}

module.exports = { createSchoolBattlePointsService };
