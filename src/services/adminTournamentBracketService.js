function createAdminTournamentBracketService({ pool }) {
  async function getBracket(tournamentId) {
    const tournamentResult = await pool.query(
      "SELECT * FROM tournaments WHERE id = $1",
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) return null;

    const tournament = tournamentResult.rows[0];
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
      rounds[match.round].push(match);
    });

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        bracket_size: tournament.bracket_size,
        level: tournament.level,
        scope_value: tournament.scope_value,
        region: tournament.region,
        team_size: tournament.team_size,
      },
      schools: schoolsResult.rows,
      rounds,
      total_rounds: tournament.bracket_size ? Math.log2(tournament.bracket_size) : 0,
    };
  }

  return { getBracket };
}

module.exports = { createAdminTournamentBracketService };
