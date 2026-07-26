function getReadyCounts(rows, match) {
  const readyMap = {};
  rows.forEach((row) => {
    readyMap[row.school_key] = parseInt(row.ready) || 0;
  });
  return {
    aReady: readyMap[match.school_a_key] || 0,
    bReady: readyMap[match.school_b_key] || 0,
  };
}

async function selectMatchQuestions(client, tournamentId) {
  const tournamentResult = await client.query(
    "SELECT questions_per_match, cefr_level FROM tournaments WHERE id = $1",
    [tournamentId]
  );
  const qCount = tournamentResult.rows[0]
    ? tournamentResult.rows[0].questions_per_match
    : 20;
  const cefr = tournamentResult.rows[0]
    ? tournamentResult.rows[0].cefr_level
    : "mixed";

  let questionResult;
  if (cefr && cefr !== "mixed") {
    questionResult = await client.query(
      "SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2",
      [cefr, qCount]
    );
    if (questionResult.rows.length < qCount) {
      const extra = await client.query(
        "SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option FROM questions WHERE cefr_level <> $1 ORDER BY RANDOM() LIMIT $2",
        [cefr, qCount - questionResult.rows.length]
      );
      questionResult.rows = questionResult.rows.concat(extra.rows);
    }
  } else {
    questionResult = await client.query(
      "SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option FROM questions ORDER BY RANDOM() LIMIT $1",
      [qCount]
    );
  }
  return questionResult.rows;
}

function createTournamentMatchLiveService({
  pool,
  getSeededWinner,
  finishMatchWithWinner,
  notifyTournamentResult,
  notifyMatchPlayers,
  logger = console,
}) {
  return async function startMatchLive(match) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE tournaments SET status = 'live' WHERE id = $1 AND status IN ('bracket', 'registration')",
        [match.tournament_id]
      );
      const checkedResult = await client.query(
        `SELECT school_key, COUNT(*) FILTER (WHERE checked_in = true) AS ready
         FROM tournament_match_players
         WHERE match_id = $1
         GROUP BY school_key`,
        [match.id]
      );
      const { aReady, bReady } = getReadyCounts(checkedResult.rows, match);

      if (aReady === 0 && bReady === 0) {
        const seeded = await getSeededWinner(
          client,
          match.tournament_id,
          match.school_a,
          match.school_a_key,
          match.school_b,
          match.school_b_key
        );
        await finishMatchWithWinner(client, match, seeded.school, seeded.school_key, 0, 0, true);
        await client.query("COMMIT");
        notifyTournamentResult(match, seeded.school, seeded.school_key);
        logger.log(`[Turnir] Match #${match.id} — ikkala maktab ham kelmadi, yuqori seed o'tdi: ${seeded.school}`);
        return;
      }
      if (aReady === 0) {
        await finishMatchWithWinner(client, match, match.school_b, match.school_b_key, 0, 0, true);
        await client.query("COMMIT");
        notifyTournamentResult(match, match.school_b, match.school_b_key);
        logger.log(`[Turnir] Match #${match.id} — ${match.school_a} kelmadi, ${match.school_b} walkover g'olib`);
        return;
      }
      if (bReady === 0) {
        await finishMatchWithWinner(client, match, match.school_a, match.school_a_key, 0, 0, true);
        await client.query("COMMIT");
        notifyTournamentResult(match, match.school_a, match.school_a_key);
        logger.log(`[Turnir] Match #${match.id} — ${match.school_b} kelmadi, ${match.school_a} walkover g'olib`);
        return;
      }

      const questions = await selectMatchQuestions(client, match.tournament_id);
      await client.query(
        "UPDATE tournament_matches SET status = 'live', started_at = NOW(), questions_data = $1 WHERE id = $2",
        [JSON.stringify(questions), match.id]
      );
      await client.query("COMMIT");
      logger.log(`[Turnir] Match #${match.id} (${match.school_a} ${aReady} vs ${bReady} ${match.school_b}) — JANG BOSHLANDI, ${questions.length} savol`);
      notifyMatchPlayers(match.id, "matchLiveStart", { matchId: match.id });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("startMatchLive xatosi:", error.message);
    } finally {
      client.release();
    }
  };
}

module.exports = { createTournamentMatchLiveService };
