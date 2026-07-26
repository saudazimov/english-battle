// Yordamchi: foydalanuvchi shu matchda o'ynashga haqlimi (jamoa a'zosimi)
function createTournamentMatchPlayerService({ pool }) {
  return async function getMatchPlayer(matchId, userId) {
    const result = await pool.query(
      `SELECT mp.id, mp.match_id, mp.user_id, mp.school, mp.school_key, mp.checked_in, mp.score, mp.finished,
              tm.member_role, tm.slot_order
       FROM tournament_match_players mp
       LEFT JOIN tournament_team_members tm
         ON tm.tournament_id = (SELECT tournament_id FROM tournament_matches WHERE id = mp.match_id)
         AND tm.user_id = mp.user_id
       WHERE mp.match_id = $1 AND mp.user_id = $2`,
      [matchId, userId]
    );
    return result.rows[0] || null;
  };
}

module.exports = { createTournamentMatchPlayerService };
