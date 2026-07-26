// Matchni live holatiga o'tkazish (jang boshlanadi) yoki walkover
function createTournamentResultNotifier({ notifyMatchPlayers }) {
  return function notifyTournamentResult(
    match,
    winnerSchool,
    winnerSchoolKey,
    scoreA = 0,
    scoreB = 0
  ) {
    notifyMatchPlayers(match.id, "matchFinished", {
      matchId: parseInt(match.id),
      score_a: scoreA,
      score_b: scoreB,
      school_a: match.school_a,
      school_b: match.school_b,
      winner: winnerSchool,
      winner_key: winnerSchoolKey,
    });
  };
}

module.exports = { createTournamentResultNotifier };
