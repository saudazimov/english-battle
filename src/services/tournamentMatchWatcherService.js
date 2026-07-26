const CHECKIN_LEAD_MINUTES = 15;

function createTournamentMatchWatcherService({
  pool,
  openMatchCheckin,
  startMatchLive,
  expireTournamentMatch,
  logger = console,
  currentDate = () => new Date(),
}) {
  return async function tournamentMatchWatcher() {
    try {
      const now = currentDate();
      const checkinThreshold = new Date(
        now.getTime() + CHECKIN_LEAD_MINUTES * 60000
      );
      const toCheckin = await pool.query(
        `SELECT id, tournament_id, round, match_no, school_a, school_b, school_a_key, school_b_key, scheduled_at
         FROM tournament_matches
         WHERE status = 'pending'
           AND school_a IS NOT NULL AND school_b IS NOT NULL
           AND scheduled_at IS NOT NULL
           AND scheduled_at <= $1`,
        [checkinThreshold]
      );
      for (const match of toCheckin.rows) {
        await openMatchCheckin(match);
      }

      const toLive = await pool.query(
        `SELECT id, tournament_id, round, match_no, school_a, school_b, school_a_key, school_b_key, scheduled_at
         FROM tournament_matches
         WHERE status = 'checkin'
           AND scheduled_at IS NOT NULL
           AND scheduled_at <= $1`,
        [now]
      );
      for (const match of toLive.rows) {
        await startMatchLive(match);
      }

      const expiredLive = await pool.query(
        `SELECT m.id
         FROM tournament_matches m
         JOIN tournaments t ON t.id = m.tournament_id
         WHERE m.status = 'live'
           AND m.started_at IS NOT NULL
           AND m.started_at + (t.seconds_per_match * INTERVAL '1 second') <= $1`,
        [now]
      );
      for (const match of expiredLive.rows) {
        await expireTournamentMatch(match.id);
      }
    } catch (error) {
      logger.error("Match watcher xatosi:", error.message);
    }
  };
}

module.exports = { createTournamentMatchWatcherService };
