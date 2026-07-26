function createSchoolTournamentTeamListController({ pool, getSchoolAdmin, logger = console }) {
  async function list(req, res) {
    try {
      const schoolAdmin = await getSchoolAdmin(req.user.id);
      if (!schoolAdmin.ok) {
        return res.status(403).json({ error: schoolAdmin.error });
      }
      const admin = schoolAdmin.user;

      const result = await pool.query(
        `SELECT tm.user_id, tm.member_role, tm.slot_order,
              u.first_name, u.last_name, u.rating, u.cefr_level, u.profile_picture
       FROM tournament_team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.tournament_id = $1 AND tm.school_key = $2
       ORDER BY tm.member_role DESC, tm.slot_order ASC`,
        [req.params.id, admin.school_key]
      );
      return res.json({ team: result.rows });
    } catch (error) {
      logger.error("Jamoa olish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createSchoolTournamentTeamListController };
