function createTournamentMatchExpiryService({
  pool,
  checkMatchCompletion,
  logger = console,
  currentDate = () => new Date(),
}) {
  return async function expireTournamentMatch(matchId) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const matchResult = await client.query(
        `SELECT m.status,
                m.started_at + (t.seconds_per_match * INTERVAL '1 second') AS deadline
         FROM tournament_matches m
         JOIN tournaments t ON t.id = m.tournament_id
         WHERE m.id = $1
         FOR UPDATE OF m`,
        [matchId]
      );
      const match = matchResult.rows[0];
      if (!match || match.status !== "live" || new Date(match.deadline) > currentDate()) {
        await client.query("ROLLBACK");
        return false;
      }

      await client.query(
        `UPDATE tournament_match_players
         SET finished = true, finished_at = COALESCE(finished_at, $2)
         WHERE match_id = $1 AND checked_in = true AND finished = false`,
        [matchId, match.deadline]
      );
      await client.query("COMMIT");
      await checkMatchCompletion(matchId);
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Match timeout xatosi:", error.message);
      return false;
    } finally {
      client.release();
    }
  };
}

module.exports = { createTournamentMatchExpiryService };
