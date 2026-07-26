// G'olibni keyingi raundga joylashtirish
function createTournamentWinnerAdvancementService({ logger }) {
  return async function advanceWinner(client, tid, round, matchNo, winnerSchool, winnerSchoolKey) {
    if (!winnerSchool || !winnerSchoolKey) return;
    const currentMatch = await client.query(
      `SELECT school_a_key, school_b_key
     FROM tournament_matches
     WHERE tournament_id = $1 AND round = $2 AND match_no = $3`,
      [tid, round, matchNo]
    );
    if (currentMatch.rows.length > 0) {
      const current = currentMatch.rows[0];
      const loserKey = current.school_a_key === winnerSchoolKey
        ? current.school_b_key
        : current.school_a_key;
      if (loserKey) {
        await client.query(
          "UPDATE tournament_schools SET eliminated = true WHERE tournament_id = $1 AND school_key = $2",
          [tid, loserKey]
        );
      }
    }
    const nextMatchNo = Math.ceil(matchNo / 2);
    const isA = (matchNo % 2 === 1);
    const column = isA ? "school_a" : "school_b";
    const keyColumn = isA ? "school_a_key" : "school_b_key";
    // Keyingi raund mavjudmi?
    const next = await client.query(
      "SELECT id FROM tournament_matches WHERE tournament_id = $1 AND round = $2 AND match_no = $3",
      [tid, round + 1, nextMatchNo]
    );
    if (next.rows.length > 0) {
      await client.query(
        `UPDATE tournament_matches SET ${column} = $1, ${keyColumn} = $2 WHERE id = $3`,
        [winnerSchool, winnerSchoolKey, next.rows[0].id]
      );
    } else {
      // Keyingi raund yo'q → bu final edi → g'olib chempion
      await client.query(
        "UPDATE tournament_schools SET placement = 1 WHERE tournament_id = $1 AND school_key = $2",
        [tid, winnerSchoolKey]
      );
      // Final mag'lubi → 2-o'rin
      const finalMatch = await client.query(
        "SELECT school_a, school_b, school_a_key, school_b_key FROM tournament_matches WHERE tournament_id = $1 AND round = $2 AND match_no = $3",
        [tid, round, matchNo]
      );
      if (finalMatch.rows.length > 0) {
        const match = finalMatch.rows[0];
        const winnerIsA = match.school_a_key === winnerSchoolKey;
        const runnerUp = winnerIsA ? match.school_b : match.school_a;
        const runnerUpKey = winnerIsA ? match.school_b_key : match.school_a_key;
        if (runnerUp && runnerUpKey) {
          await client.query(
            "UPDATE tournament_schools SET placement = 2 WHERE tournament_id = $1 AND school_key = $2",
            [tid, runnerUpKey]
          );
        }
      }
      // Turnir yakunlandi → 'finished' holatiga
      await client.query(
        "UPDATE tournaments SET status = 'finished' WHERE id = $1",
        [tid]
      );
      logger.log(`[Turnir] Turnir #${tid} YAKUNLANDI — Chempion: ${winnerSchool}`);
    }
  };
}

module.exports = { createTournamentWinnerAdvancementService };
