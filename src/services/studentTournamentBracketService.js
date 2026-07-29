function createStudentTournamentBracketService({ pool }) {
  async function getBracket(tournamentId, userId) {
    const membershipResult = await pool.query(
      "SELECT school, school_key FROM tournament_team_members WHERE tournament_id = $1 AND user_id = $2 LIMIT 1",
      [tournamentId, userId]
    );
    if (membershipResult.rows.length === 0) return { status: "not-member" };

    const mySchool = membershipResult.rows[0].school;
    const mySchoolKey = membershipResult.rows[0].school_key;
    const tournamentResult = await pool.query(
      "SELECT * FROM tournaments WHERE id = $1",
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) return { status: "not-found" };

    const tournament = tournamentResult.rows[0];
    const schoolsResult = await pool.query(
      "SELECT school, region, district, school_key, seed, avg_rating, eliminated, placement FROM tournament_schools WHERE tournament_id = $1 ORDER BY seed ASC",
      [tournamentId]
    );
    const matchesResult = await pool.query(
      `SELECT id, round, match_no, school_a, school_b, school_a_key, school_b_key, score_a, score_b,
              winner_school, winner_school_key, status, scheduled_at
       FROM tournament_matches WHERE tournament_id = $1
       ORDER BY round ASC, match_no ASC`,
      [tournamentId]
    );

    const rounds = {};
    matchesResult.rows.forEach((match) => {
      if (!rounds[match.round]) rounds[match.round] = [];
      match.is_mine = match.school_a_key === mySchoolKey || match.school_b_key === mySchoolKey;
      rounds[match.round].push(match);
    });

    return {
      status: "found",
      result: {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
          bracket_size: tournament.bracket_size,
          scope_value: tournament.scope_value,
          region: tournament.region,
        },
        my_school: mySchool,
        my_school_key: mySchoolKey,
        schools: schoolsResult.rows,
        rounds,
        total_rounds: tournament.bracket_size ? Math.log2(tournament.bracket_size) : 0,
      },
    };
  }

  return { getBracket };
}

module.exports = { createStudentTournamentBracketService };
