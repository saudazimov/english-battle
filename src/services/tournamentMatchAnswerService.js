const { createAnswerEventService } = require("./answerEventService");

function createTournamentMatchAnswerService({
  pool,
  expireTournamentMatch,
  notifyMatchPlayers,
  answerEventService,
  logger = console,
}) {
  const diagnosticEvents = answerEventService
    || (pool ? createAnswerEventService({ pool, logger }) : null);
  async function submitAnswer(client, matchId, userId, body) {
    const { questionId, answer } = body;
    const normalizedAnswer = String(answer || "").toLowerCase();
    if (!["a", "b", "c", "d"].includes(normalizedAnswer)) {
      return { status: "invalid-answer" };
    }

    await client.query("BEGIN");
    const matchResult = await client.query(
      `SELECT m.status, m.questions_data, m.started_at, t.seconds_per_match
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id
       WHERE m.id = $1
       FOR UPDATE OF m`,
      [matchId]
    );
    const match = matchResult.rows[0];
    if (!match || match.status !== "live") {
      await client.query("ROLLBACK");
      return { status: "inactive" };
    }

    const playerResult = await client.query(
      `SELECT id, checked_in, finished
       FROM tournament_match_players
       WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId]
    );
    const player = playerResult.rows[0];
    if (!player || !player.checked_in) {
      await client.query("ROLLBACK");
      return { status: "not-active-participant" };
    }
    if (player.finished) {
      await client.query("ROLLBACK");
      return { status: "finished" };
    }

    const deadline = new Date(match.started_at).getTime()
      + Number(match.seconds_per_match) * 1000;
    if (!Number.isFinite(deadline) || Date.now() >= deadline) {
      await client.query("ROLLBACK");
      await expireTournamentMatch(matchId);
      return { status: "expired" };
    }

    const raw = typeof match.questions_data === "string"
      ? JSON.parse(match.questions_data)
      : match.questions_data;
    const question = Array.isArray(raw)
      ? raw.find((item) => String(item.id) === String(questionId))
      : null;
    if (!question) {
      await client.query("ROLLBACK");
      return { status: "question-not-found" };
    }

    const isCorrect = normalizedAnswer === String(question.correct_option).toLowerCase();
    const inserted = await client.query(
      `INSERT INTO tournament_match_answers (match_id, user_id, question_id, answer, is_correct)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id, user_id, question_id) DO NOTHING
       RETURNING id`,
      [matchId, userId, question.id, normalizedAnswer, isCorrect]
    );
    if (inserted.rows.length === 0) {
      await client.query("ROLLBACK");
      return { status: "duplicate" };
    }

    if (isCorrect) {
      await client.query(
        "UPDATE tournament_match_players SET score = score + 1 WHERE match_id = $1 AND user_id = $2",
        [matchId, userId]
      );
    }

    const teamScoresResult = await client.query(
      "SELECT school_key, COALESCE(SUM(score),0) AS total FROM tournament_match_players WHERE match_id = $1 GROUP BY school_key",
      [matchId]
    );
    const teamScores = {};
    teamScoresResult.rows.forEach((row) => {
      teamScores[row.school_key] = parseInt(row.total) || 0;
    });
    await client.query("COMMIT");

    if (diagnosticEvents) {
      await diagnosticEvents.recordOneSafe({
        studentId: userId,
        questionId: question.id,
        sourceMode: "battle",
        sourceRecordId: `tournament:${matchId}`,
        sourceQuestionId: question.id,
        selectedOption: normalizedAnswer,
        correctOption: question.correct_option,
        isCorrect,
        responseTimeMs: body.response_time_ms,
        detectedCefrLevel: question.cefr_level,
        legacySkill: question.skill,
        eventMetadata: { battle_type: "tournament", tournament_match_id: matchId },
      });
    }

    notifyMatchPlayers(matchId, "scoreUpdate", {
      matchId: parseInt(matchId),
      team_scores: teamScores,
    });
    return {
      status: "submitted",
      correct: isCorrect,
      correctOption: question.correct_option,
      teamScores,
    };
  }

  return { submitAnswer };
}

module.exports = { createTournamentMatchAnswerService };
