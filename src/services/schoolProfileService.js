function createSchoolProfileService({ pool, getSchoolAdmin }) {
  return {
    async getProfile(userId) {
      const schoolAdmin = await getSchoolAdmin(userId);
      if (!schoolAdmin.ok) return { ok: false, error: schoolAdmin.error };
      const me = schoolAdmin.user;

      const personal = await pool.query(
        "SELECT phone, profile_picture, created_at FROM users WHERE id = $1",
        [me.id]
      );
      const personalRow = personal.rows[0] || {};
      const stats = await pool.query(
        `SELECT COUNT(*) AS total, ROUND(AVG(rating)) AS avg_rating, MAX(rating) AS top_rating
       FROM users
       WHERE region = $1 AND district = $2 AND school = $3
         AND (role = 'student' OR role IS NULL) AND (is_banned IS NULL OR is_banned = false)`,
        [me.region, me.district, me.school]
      );
      const statsRow = stats.rows[0];
      const tournaments = await pool.query(
        `SELECT
         COUNT(*) FILTER (WHERE status IN ('registration','bracket','live')) AS active,
         COUNT(*) AS total
       FROM tournaments t
       WHERE (
         (t.level = 'district' AND t.scope_value = $1 AND t.region = $2)
         OR (t.level = 'region' AND t.scope_value = $2)
         OR (t.level = 'country')
       )`,
        [me.district, me.region]
      );
      const tournamentRow = tournaments.rows[0];
      const teams = await pool.query(
        `SELECT COUNT(DISTINCT tournament_id) AS c FROM tournament_team_members WHERE school_key = $1`,
        [me.school_key]
      );

      return {
        ok: true,
        profile: {
          admin: {
            first_name: me.first_name,
            last_name: me.last_name,
            phone: personalRow.phone || null,
            profile_picture: personalRow.profile_picture || null,
            created_at: personalRow.created_at || null,
          },
          school: me.school,
          region: me.region,
          district: me.district,
          school_stats: {
            total_students: parseInt(statsRow.total) || 0,
            avg_rating: parseInt(statsRow.avg_rating) || 0,
            top_rating: parseInt(statsRow.top_rating) || 0,
          },
          management: {
            active_tournaments: parseInt(tournamentRow.active) || 0,
            total_tournaments: parseInt(tournamentRow.total) || 0,
            teams_built: parseInt(teams.rows[0].c) || 0,
          },
        },
      };
    },
  };
}

module.exports = { createSchoolProfileService };
