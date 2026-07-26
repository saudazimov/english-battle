function calculateTeamScores(players, match) {
  let scoreA = 0;
  let scoreB = 0;
  players.forEach((player) => {
    if (player.school_key === match.school_a_key) scoreA += player.score;
    else if (player.school_key === match.school_b_key) scoreB += player.score;
  });
  return { scoreA, scoreB };
}

async function resolveTiedWinner({ client, match, matchId, scoreA, scoreB, getSeededWinner, logger }) {
  const timeResult = await client.query(
    `SELECT school_key, MAX(finished_at) AS last_finish
     FROM tournament_match_players
     WHERE match_id = $1 AND checked_in = true AND finished = true
     GROUP BY school_key`,
    [matchId]
  );
  let timeA = null;
  let timeB = null;
  timeResult.rows.forEach((row) => {
    if (row.school_key === match.school_a_key) timeA = row.last_finish;
    else if (row.school_key === match.school_b_key) timeB = row.last_finish;
  });

  let winner = null;
  let winnerKey = null;
  if (timeA && timeB) {
    const timeAMs = new Date(timeA).getTime();
    const timeBMs = new Date(timeB).getTime();
    if (timeAMs !== timeBMs) {
      const aWon = timeAMs < timeBMs;
      winner = aWon ? match.school_a : match.school_b;
      winnerKey = aWon ? match.school_a_key : match.school_b_key;
    } else {
      const seeded = await getSeededWinner(
        client,
        match.tournament_id,
        match.school_a,
        match.school_a_key,
        match.school_b,
        match.school_b_key
      );
      winner = seeded.school;
      winnerKey = seeded.school_key;
    }
    logger.log(`[Turnir] Match #${matchId} DURANG (${scoreA}-${scoreB}) → tezlik bo'yicha g'olib: ${winner}`);
  } else if (timeA) {
    winner = match.school_a;
    winnerKey = match.school_a_key;
  } else if (timeB) {
    winner = match.school_b;
    winnerKey = match.school_b_key;
  }
  return { winner, winnerKey };
}

function createTournamentMatchCompletionCheckService({
  pool,
  getSeededWinner,
  advanceWinner,
  notifyMatchPlayers,
  logger = console,
}) {
  return async function checkMatchCompletion(matchId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const matchResult = await client.query(
        "SELECT * FROM tournament_matches WHERE id = $1 FOR UPDATE",
        [matchId]
      );
      const match = matchResult.rows[0];
      if (!match || match.status === "done") {
        await client.query("ROLLBACK");
        return;
      }

      const playersResult = await client.query(
        "SELECT user_id, school, school_key, score, finished, checked_in FROM tournament_match_players WHERE match_id = $1 AND checked_in = true",
        [matchId]
      );
      const players = playersResult.rows;
      if (players.length === 0 || !players.every((player) => player.finished)) {
        await client.query("ROLLBACK");
        return;
      }

      const { scoreA, scoreB } = calculateTeamScores(players, match);
      let winner = null;
      let winnerKey = null;
      if (scoreA > scoreB) {
        winner = match.school_a;
        winnerKey = match.school_a_key;
      } else if (scoreB > scoreA) {
        winner = match.school_b;
        winnerKey = match.school_b_key;
      } else {
        ({ winner, winnerKey } = await resolveTiedWinner({
          client, match, matchId, scoreA, scoreB, getSeededWinner, logger,
        }));
      }

      await client.query(
        "UPDATE tournament_matches SET status = 'done', score_a = $1, score_b = $2, winner_school = $3, winner_school_key = $4, finished_at = NOW() WHERE id = $5",
        [scoreA, scoreB, winner, winnerKey, matchId]
      );
      if (winner) {
        await advanceWinner(client, match.tournament_id, match.round, match.match_no, winner, winnerKey);
      }
      await client.query("COMMIT");

      logger.log(`[Turnir] Match #${matchId} TUGADI: ${match.school_a} ${scoreA} — ${scoreB} ${match.school_b}, g'olib: ${winner || "durang"}`);
      notifyMatchPlayers(matchId, "matchFinished", {
        matchId: parseInt(matchId),
        score_a: scoreA,
        score_b: scoreB,
        school_a: match.school_a,
        school_b: match.school_b,
        winner,
        winner_key: winnerKey,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("checkMatchCompletion xatosi:", error.message);
    } finally {
      client.release();
    }
  };
}

module.exports = { createTournamentMatchCompletionCheckService };
