function createTournamentMatchCheckinService({
  pool,
  notifyMatchPlayers,
  logger = console,
}) {
  return async function openMatchCheckin(match) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE tournament_matches SET status = 'checkin' WHERE id = $1",
        [match.id]
      );

      for (const team of [
        { school: match.school_a, schoolKey: match.school_a_key },
        { school: match.school_b, schoolKey: match.school_b_key },
      ]) {
        if (!team.school || !team.schoolKey) continue;
        const members = await client.query(
          `SELECT user_id, member_role FROM tournament_team_members
           WHERE tournament_id = $1 AND school_key = $2
           ORDER BY member_role DESC, slot_order ASC`,
          [match.tournament_id, team.schoolKey]
        );
        for (const member of members.rows) {
          const existing = await client.query(
            "SELECT id FROM tournament_match_players WHERE match_id = $1 AND user_id = $2",
            [match.id, member.user_id]
          );
          if (existing.rows.length === 0) {
            await client.query(
              `INSERT INTO tournament_match_players (match_id, user_id, school, school_key, is_bot, checked_in, score, finished)
               VALUES ($1, $2, $3, $4, false, false, 0, false)`,
              [match.id, member.user_id, team.school, team.schoolKey]
            );
          }
        }
      }

      await client.query("COMMIT");
      logger.log(`[Turnir] Match #${match.id} (${match.school_a} vs ${match.school_b}) — CHECK-IN ochildi`);
      notifyMatchPlayers(match.id, "matchCheckinOpen", {
        matchId: match.id,
        scheduledAt: match.scheduled_at,
        schoolA: match.school_a,
        schoolB: match.school_b,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("openMatchCheckin xatosi:", error.message);
    } finally {
      client.release();
    }
  };
}

module.exports = { createTournamentMatchCheckinService };
