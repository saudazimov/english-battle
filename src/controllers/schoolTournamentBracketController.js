function createSchoolTournamentBracketController({ pool, getSchoolAdmin, logger = console }) {
  async function getBracket(req, res) {
    try {
      const schoolAdmin = await getSchoolAdmin(req.user.id);
      if (!schoolAdmin.ok) return res.status(403).json({ error: schoolAdmin.error });
      const admin = schoolAdmin.user;
      const tournamentId = req.params.id;

      const tournamentResult = await pool.query("SELECT * FROM tournaments WHERE id = $1", [tournamentId]);
      if (tournamentResult.rows.length === 0) {
        return res.status(404).json({ error: "Turnir topilmadi" });
      }
      const tournament = tournamentResult.rows[0];

      const participationResult = await pool.query(
        "SELECT seed, eliminated, placement FROM tournament_schools WHERE tournament_id = $1 AND school_key = $2",
        [tournamentId, admin.school_key]
      );
      const participation = participationResult.rows[0] || null;

      const schoolsResult = await pool.query(
        "SELECT school, region, district, school_key, seed, avg_rating, eliminated, placement FROM tournament_schools WHERE tournament_id = $1 ORDER BY seed ASC",
        [tournamentId]
      );

      const matchesResult = await pool.query(
        `SELECT id, round, match_no, school_a, school_b, school_a_key, school_b_key, score_a, score_b,
              winner_school, winner_school_key, status, scheduled_at, started_at, finished_at
       FROM tournament_matches
       WHERE tournament_id = $1
       ORDER BY round ASC, match_no ASC`,
        [tournamentId]
      );

      const rounds = {};
      matchesResult.rows.forEach((match) => {
        if (!rounds[match.round]) rounds[match.round] = [];
        match.is_mine = match.school_a_key === admin.school_key || match.school_b_key === admin.school_key;
        rounds[match.round].push(match);
      });

      return res.json({
        tournament: {
          id: tournament.id, name: tournament.name, status: tournament.status,
          bracket_size: tournament.bracket_size, level: tournament.level,
          scope_value: tournament.scope_value, region: tournament.region, team_size: tournament.team_size,
        },
        my_school: admin.school,
        my_school_key: admin.school_key,
        my_participation: participation,
        schools: schoolsResult.rows,
        rounds,
        total_rounds: tournament.bracket_size ? Math.log2(tournament.bracket_size) : 0,
      });
    } catch (error) {
      logger.error("School bracket xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getBracket };
}

module.exports = { createSchoolTournamentBracketController };
