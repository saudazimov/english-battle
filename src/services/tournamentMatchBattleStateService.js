const {
  createTournamentMatchPlayerService,
} = require("./tournamentMatchPlayerService");

function createTournamentMatchBattleStateService({ pool }) {
  const getMatchPlayer = createTournamentMatchPlayerService({ pool });

  async function getBattleState(matchId, userId) {
    const player = await getMatchPlayer(matchId, userId);
    if (!player) return { status: "not-participant" };

    const matchResult = await pool.query(
      `SELECT m.*, t.name AS tournament_name, t.seconds_per_match, t.questions_per_match
       FROM tournament_matches m JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1`,
      [matchId]
    );
    const match = matchResult.rows[0];
    if (!match) return { status: "not-found" };

    if (match.status !== "live" && match.status !== "done") {
      return {
        status: "waiting",
        result: { status: match.status, message: "Jang hali boshlanmagan" },
      };
    }

    let questions = [];
    if (match.questions_data) {
      const raw = typeof match.questions_data === "string"
        ? JSON.parse(match.questions_data)
        : match.questions_data;
      questions = raw.map((question) => ({
        id: question.id,
        question_text: question.question_text,
        option_a: question.option_a,
        option_b: question.option_b,
        option_c: question.option_c,
        option_d: question.option_d,
      }));
    }

    const progressResult = await pool.query(
      "SELECT score, finished FROM tournament_match_players WHERE match_id = $1 AND user_id = $2",
      [matchId, userId]
    );
    const answeredResult = await pool.query(
      `SELECT question_id FROM tournament_match_answers
       WHERE match_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [matchId, userId]
    );
    const teamScoresResult = await pool.query(
      `SELECT school_key, COALESCE(SUM(score),0) AS total
       FROM tournament_match_players WHERE match_id = $1 GROUP BY school_key`,
      [matchId]
    );
    const teamScores = {};
    teamScoresResult.rows.forEach((row) => {
      teamScores[row.school_key] = parseInt(row.total) || 0;
    });

    return {
      status: "found",
      result: {
        status: match.status,
        match: {
          id: match.id,
          school_a: match.school_a,
          school_b: match.school_b,
          school_a_key: match.school_a_key,
          school_b_key: match.school_b_key,
          tournament_name: match.tournament_name,
          seconds_per_match: match.seconds_per_match,
          started_at: match.started_at,
          winner_school: match.winner_school,
          winner_school_key: match.winner_school_key,
        },
        my_school: player.school,
        my_school_key: player.school_key,
        my_score: progressResult.rows[0] ? progressResult.rows[0].score : 0,
        my_finished: progressResult.rows[0] ? progressResult.rows[0].finished : false,
        answered_question_ids: answeredResult.rows.map((row) => row.question_id),
        questions,
        team_scores: teamScores,
      },
    };
  }

  return { getBattleState };
}

module.exports = { createTournamentMatchBattleStateService };
