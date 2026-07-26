const FINISH_MATCH_SQL = `UPDATE tournament_matches
     SET status = 'done', winner_school = $1, winner_school_key = $2,
         score_a = $3, score_b = $4, finished_at = NOW()
     WHERE id = $5`;

// G'olibni belgilab matchni tugatish (walkover yoki normal)
function createTournamentMatchCompletionService({ advanceWinner }) {
  return async function finishMatchWithWinner(
    client,
    match,
    winnerSchool,
    winnerSchoolKey,
    scoreA,
    scoreB,
    isWalkover
  ) {
    await client.query(
      FINISH_MATCH_SQL,
      [winnerSchool, winnerSchoolKey, scoreA, scoreB, match.id]
    );
    // G'olibni keyingi raundga ko'chirish (6.8 da to'liq, hozir asos)
    await advanceWinner(
      client,
      match.tournament_id,
      match.round,
      match.match_no,
      winnerSchool,
      winnerSchoolKey
    );
  };
}

module.exports = { createTournamentMatchCompletionService };
