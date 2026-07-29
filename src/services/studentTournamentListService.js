function createStudentTournamentListService({ pool }) {
  async function listTournaments(userId) {
    const userResult = await pool.query(
      "SELECT school FROM users WHERE id = $1",
      [userId]
    );
    const mySchool = userResult.rows[0] ? userResult.rows[0].school : null;

    const tournamentResult = await pool.query(
      `SELECT DISTINCT t.id, t.name, t.status, t.level, t.scope_value, t.region,
              t.bracket_size, t.team_size, t.created_at,
              tm.member_role, tm.school, tm.school_key
       FROM tournament_team_members tm
       JOIN tournaments t ON t.id = tm.tournament_id
       WHERE tm.user_id = $1
       ORDER BY t.created_at DESC`,
      [userId]
    );

    const tournaments = [];
    for (const tournament of tournamentResult.rows) {
      const matchResult = await pool.query(
        `SELECT id, round, match_no, school_a, school_b, school_a_key, school_b_key, score_a, score_b,
                winner_school, winner_school_key, status, scheduled_at
         FROM tournament_matches
         WHERE tournament_id = $1
           AND (school_a_key = $2 OR school_b_key = $2)
         ORDER BY round ASC, match_no ASC`,
        [tournament.id, tournament.school_key]
      );

      let activeMatch = null;
      const priority = { live: 4, checkin: 3, pending: 2, done: 1 };
      matchResult.rows.forEach((match) => {
        if (!activeMatch || priority[match.status] > priority[activeMatch.status]) {
          activeMatch = match;
        }
      });

      tournaments.push({
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        level: tournament.level,
        scope_value: tournament.scope_value,
        region: tournament.region,
        my_school: tournament.school,
        my_school_key: tournament.school_key,
        my_role: tournament.member_role,
        bracket_size: tournament.bracket_size,
        active_match: activeMatch,
        my_matches: matchResult.rows,
      });
    }

    return { my_school: mySchool, tournaments };
  }

  return { listTournaments };
}

module.exports = { createStudentTournamentListService };
