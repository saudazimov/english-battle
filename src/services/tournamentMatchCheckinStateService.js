const {
  createTournamentMatchPlayerService,
} = require("./tournamentMatchPlayerService");

function createTournamentMatchCheckinStateService({ pool }) {
  const getMatchPlayer = createTournamentMatchPlayerService({ pool });

  async function getCheckinState(matchId, userId) {
    const matchResult = await pool.query(
      `SELECT m.*, t.name AS tournament_name, t.team_size, t.questions_per_match, t.seconds_per_match
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1`,
      [matchId]
    );
    if (matchResult.rows.length === 0) return { status: "not-found" };
    const match = matchResult.rows[0];

    const player = await getMatchPlayer(matchId, userId);
    if (!player) return { status: "not-participant" };

    const playersResult = await pool.query(
      `SELECT mp.user_id, mp.school, mp.school_key, mp.checked_in,
              u.first_name, u.last_name, u.profile_picture, u.rating,
              tm.member_role, tm.slot_order
       FROM tournament_match_players mp
       JOIN users u ON u.id = mp.user_id
       LEFT JOIN tournament_team_members tm
         ON tm.tournament_id = $2 AND tm.user_id = mp.user_id
       WHERE mp.match_id = $1
       ORDER BY mp.school_key ASC, tm.member_role DESC, tm.slot_order ASC`,
      [matchId, match.tournament_id]
    );

    const teams = {};
    [[match.school_a_key, match.school_a], [match.school_b_key, match.school_b]].forEach(([key, name]) => {
      if (key) teams[key] = { school: name, members: [] };
    });
    playersResult.rows.forEach((member) => {
      if (!teams[member.school_key]) {
        teams[member.school_key] = { school: member.school, members: [] };
      }
      teams[member.school_key].members.push({
        user_id: member.user_id,
        name: ((member.first_name || "") + " " + (member.last_name || "")).trim(),
        profile_picture: member.profile_picture,
        rating: member.rating,
        role: member.member_role || "starter",
        checked_in: member.checked_in,
        is_me: member.user_id === userId,
      });
    });

    return {
      status: "found",
      result: {
        match: {
          id: match.id,
          status: match.status,
          school_a: match.school_a,
          school_b: match.school_b,
          school_a_key: match.school_a_key,
          school_b_key: match.school_b_key,
          scheduled_at: match.scheduled_at,
          tournament_name: match.tournament_name,
          questions_per_match: match.questions_per_match,
          seconds_per_match: match.seconds_per_match,
        },
        my_school: player.school,
        my_school_key: player.school_key,
        my_checked_in: player.checked_in,
        teams,
      },
    };
  }

  return { getCheckinState };
}

module.exports = { createTournamentMatchCheckinStateService };
