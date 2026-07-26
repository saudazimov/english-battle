function createSchoolTournamentsController({ pool, getSchoolAdmin, logger = console }) {
  async function list(req, res) {
    try {
      const schoolAdmin = await getSchoolAdmin(req.user.id);
      if (!schoolAdmin.ok) {
        return res.status(403).json({ error: schoolAdmin.error });
      }
      const admin = schoolAdmin.user;

      const result = await pool.query(
        `SELECT t.*,
              (SELECT COUNT(*) FROM tournament_team_members tm
               WHERE tm.tournament_id = t.id AND tm.school_key = $1) AS my_team_count
       FROM tournaments t
       WHERE t.status IN ('registration','bracket','live','finished')
         AND (
           (t.level = 'district' AND t.scope_value = $2 AND t.region = $3)
           OR (t.level = 'region' AND t.scope_value = $3)
           OR (t.level = 'country')
         )
       ORDER BY t.created_at DESC`,
        [admin.school_key, admin.district, admin.region]
      );
      return res.json({
        school: admin.school,
        region: admin.region,
        district: admin.district,
        tournaments: result.rows,
      });
    } catch (error) {
      logger.error("School turnirlar xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createSchoolTournamentsController };
