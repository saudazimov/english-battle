function createTournamentMatchPlayerCheckinService({ notifyMatchPlayers }) {
  async function checkIn(client, matchId, userId) {
    await client.query("BEGIN");
    const matchResult = await client.query(
      `SELECT m.status, t.team_size
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1
       FOR UPDATE OF m`,
      [matchId]
    );
    if (matchResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { status: "not-found" };
    }

    const match = matchResult.rows[0];
    if (match.status !== "checkin") {
      await client.query("ROLLBACK");
      return { status: "not-open", matchStatus: match.status };
    }

    const playerResult = await client.query(
      `SELECT id, school_key, checked_in
       FROM tournament_match_players
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );
    const player = playerResult.rows[0];
    if (!player) {
      await client.query("ROLLBACK");
      return { status: "not-participant" };
    }
    if (player.checked_in) {
      await client.query("COMMIT");
      return { status: "checked-in" };
    }

    const readyResult = await client.query(
      `SELECT COUNT(*) AS c
       FROM tournament_match_players
       WHERE match_id = $1 AND school_key = $2 AND checked_in = true`,
      [matchId, player.school_key]
    );
    if ((parseInt(readyResult.rows[0].c, 10) || 0) >= match.team_size) {
      await client.query("ROLLBACK");
      return { status: "team-full" };
    }

    await client.query(
      "UPDATE tournament_match_players SET checked_in = true, checked_in_at = NOW() WHERE match_id = $1 AND user_id = $2",
      [matchId, userId]
    );
    await client.query("COMMIT");

    notifyMatchPlayers(matchId, "checkinUpdate", {
      matchId: parseInt(matchId),
      userId,
    });
    return { status: "checked-in" };
  }

  return { checkIn };
}

module.exports = { createTournamentMatchPlayerCheckinService };
