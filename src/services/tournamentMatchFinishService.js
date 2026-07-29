function createTournamentMatchFinishService({
  expireTournamentMatch,
  checkMatchCompletion,
}) {
  async function finishMatch(client, matchId, userId) {
    await client.query("BEGIN");
    const matchResult = await client.query(
      `SELECT m.status, m.questions_data, m.started_at, t.seconds_per_match
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1
       FOR UPDATE OF m`,
      [matchId]
    );
    const match = matchResult.rows[0];
    if (!match || match.status !== "live") {
      await client.query("ROLLBACK");
      return { status: "inactive" };
    }

    const playerResult = await client.query(
      `SELECT checked_in, finished FROM tournament_match_players
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );
    const player = playerResult.rows[0];
    if (!player || !player.checked_in) {
      await client.query("ROLLBACK");
      return { status: "not-active-participant" };
    }
    if (player.finished) {
      await client.query("COMMIT");
      return { status: "already-finished" };
    }

    const questions = typeof match.questions_data === "string"
      ? JSON.parse(match.questions_data)
      : match.questions_data;
    const totalQuestions = Array.isArray(questions) ? questions.length : 0;
    const answeredResult = await client.query(
      `SELECT COUNT(*) AS c FROM tournament_match_answers
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );
    const answeredCount = parseInt(answeredResult.rows[0].c, 10) || 0;
    const deadline = new Date(match.started_at).getTime()
      + Number(match.seconds_per_match) * 1000;
    const timedOut = !Number.isFinite(deadline) || Date.now() >= deadline;
    if (!timedOut && answeredCount < totalQuestions) {
      await client.query("ROLLBACK");
      return { status: "incomplete" };
    }

    await client.query(
      "UPDATE tournament_match_players SET finished = true, finished_at = NOW() WHERE match_id = $1 AND user_id = $2",
      [matchId, userId]
    );
    await client.query("COMMIT");

    if (timedOut) await expireTournamentMatch(matchId);
    else await checkMatchCompletion(matchId);
    return { status: "finished" };
  }

  return { finishMatch };
}

module.exports = { createTournamentMatchFinishService };
