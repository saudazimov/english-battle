function outcome(statusCode, body) {
  return { statusCode, body };
}

function validateSessionAnswers(examSession, answers) {
  const questionIds = (examSession.question_ids || []).map(Number);
  const submittedIds = answers.map((answer) => parseInt(answer.question_id, 10));
  const uniqueIds = new Set(submittedIds);
  const validAnswerSet = answers.every((answer) => (
    answer
    && questionIds.includes(parseInt(answer.question_id, 10))
    && (answer.answer == null
      || ["A", "B", "C", "D"].includes(String(answer.answer).toUpperCase()))
  ));

  if (
    answers.length !== questionIds.length
    || uniqueIds.size !== questionIds.length
    || !validAnswerSet
  ) {
    return null;
  }
  return questionIds;
}

async function checkProgressionEligibility({ pool, userId, examSession, getNextLevel }) {
  const userResult = await pool.query(
    "SELECT cefr_level FROM users WHERE id = $1",
    [userId]
  );
  if (userResult.rows.length === 0) {
    return outcome(404, { error: "Foydalanuvchi topilmadi" });
  }

  const currentLevel = userResult.rows[0].cefr_level;
  if (currentLevel !== examSession.from_level) {
    return outcome(400, {
      error: "Foydalanuvchi darajasi o'zgargan, yangi imtihon boshlang",
    });
  }
  const nextLevel = getNextLevel(currentLevel);
  if (!nextLevel) {
    return outcome(400, { error: "Siz eng yuqori darajadasiz — imtihon yo'q." });
  }

  const lastAttempt = await pool.query(
    `SELECT taken_at, passed FROM exam_attempts
     WHERE user_id = $1 AND from_level = $2
     ORDER BY taken_at DESC LIMIT 1`,
    [userId, currentLevel]
  );
  if (lastAttempt.rows.length > 0 && !lastAttempt.rows[0].passed) {
    const hoursSince = (
      Date.now() - new Date(lastAttempt.rows[0].taken_at).getTime()
    ) / 3600000;
    const cooldownHours = 24;
    if (hoursSince < cooldownHours) {
      const wait = Math.ceil(cooldownHours - hoursSince);
      return outcome(429, {
        error: `Keyingi imtihongacha ${wait} soat kuting.`,
        cooldown_hours_left: wait,
      });
    }
  }

  const statsResult = await pool.query(
    `SELECT COUNT(*) AS battles,
            COALESCE(SUM(my_score),0) AS total_correct,
            COALESCE(SUM(total_questions),0) AS total_questions
     FROM battle_history
     WHERE user_id = $1 AND cefr_level = $2 AND mode IN ('ranked','casual')`,
    [userId, currentLevel]
  );
  const battles = parseInt(statsResult.rows[0].battles);
  const totalQuestions = parseInt(statsResult.rows[0].total_questions);
  const accuracy = totalQuestions > 0
    ? Math.round((parseInt(statsResult.rows[0].total_correct) / totalQuestions) * 100)
    : 0;
  if (battles < 10 || accuracy < 70) {
    return outcome(403, {
      error: "Imtihon shartlari bajarilmagan (kamida 10 jang va 70% aniqlik kerak).",
      battles,
      accuracy,
    });
  }

  return { currentLevel, nextLevel };
}

async function gradeAnswers(pool, questionIds, answers) {
  const questionResult = await pool.query(
    "SELECT id, correct_option, skill FROM questions WHERE id = ANY($1::int[])",
    [questionIds]
  );
  const questionMap = new Map(
    questionResult.rows.map((question) => [Number(question.id), question])
  );
  if (questionMap.size !== questionIds.length) {
    return outcome(400, { error: "Imtihon savollaridan biri topilmadi" });
  }

  let totalCorrect = 0;
  const skillStats = {};
  for (const answer of answers) {
    const question = questionMap.get(parseInt(answer.question_id, 10));
    const skill = question.skill || "other";
    if (!skillStats[skill]) skillStats[skill] = { correct: 0, total: 0 };
    skillStats[skill].total++;

    if (question.correct_option === String(answer.answer || "").toUpperCase()) {
      totalCorrect++;
      skillStats[skill].correct++;
    }
  }

  const total = questionIds.length;
  const overallPercent = total > 0 ? Math.round((totalCorrect / total) * 100) : 0;
  const passOverall = 75;
  const passSkill = 60;
  const skillResults = {};
  let allSkillsPassed = true;

  for (const skill in skillStats) {
    const stats = skillStats[skill];
    const percent = Math.round((stats.correct / stats.total) * 100);
    skillResults[skill] = {
      correct: stats.correct,
      total: stats.total,
      percent,
    };
    if (percent < passSkill) allSkillsPassed = false;
  }

  return {
    totalCorrect,
    total,
    overallPercent,
    passOverall,
    passSkill,
    skillResults,
    passed: overallPercent >= passOverall && allSkillsPassed,
  };
}

async function persistAttempt({
  pool,
  sessionId,
  userId,
  currentLevel,
  nextLevel,
  grading,
}) {
  const levelChanged = (
    grading.passed && nextLevel !== null && nextLevel !== undefined
  );
  let newLevel = currentLevel;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const lockedSession = await client.query(
      `SELECT status FROM exam_sessions
       WHERE id=$1 AND user_id=$2
       FOR UPDATE`,
      [sessionId, userId]
    );
    if (!lockedSession.rows[0] || lockedSession.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      return outcome(400, {
        error: "Imtihon sessiyasi allaqachon yakunlangan",
      });
    }

    if (levelChanged) {
      await client.query(
        "UPDATE users SET cefr_level = $1 WHERE id = $2",
        [nextLevel, userId]
      );
      newLevel = nextLevel;
    }
    await client.query(
      `INSERT INTO exam_attempts
       (user_id, exam_type, from_level, to_level, total_questions, total_correct, overall_percent,
        pass_overall_required, pass_skill_required, skill_results, passed, level_changed)
       VALUES ($1, 'ultimate', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        userId,
        currentLevel,
        nextLevel || null,
        grading.total,
        grading.totalCorrect,
        grading.overallPercent,
        grading.passOverall,
        grading.passSkill,
        JSON.stringify(grading.skillResults),
        grading.passed,
        levelChanged,
      ]
    );
    await client.query(
      "UPDATE exam_sessions SET status='submitted', submitted_at=NOW() WHERE id=$1",
      [sessionId]
    );
    await client.query("COMMIT");
    return { newLevel };
  } catch (transactionError) {
    await client.query("ROLLBACK");
    throw transactionError;
  } finally {
    client.release();
  }
}

function createExamSubmitService({ pool, getNextLevel }) {
  async function submitExam({ userId, sessionId, answers }) {
    const sessionResult = await pool.query(
      `SELECT * FROM exam_sessions
       WHERE id=$1 AND user_id=$2 AND status='active'`,
      [sessionId, userId]
    );
    const examSession = sessionResult.rows[0];
    if (!examSession) {
      return outcome(400, { error: "Imtihon sessiyasi faol emas" });
    }
    if (new Date(examSession.expires_at) < new Date()) {
      await pool.query(
        "UPDATE exam_sessions SET status='expired' WHERE id=$1",
        [sessionId]
      );
      return outcome(400, { error: "Imtihon vaqti tugagan" });
    }

    const questionIds = validateSessionAnswers(examSession, answers);
    if (!questionIds) {
      return outcome(400, { error: "Imtihon savollari sessiyaga mos emas" });
    }

    const progression = await checkProgressionEligibility({
      pool,
      userId,
      examSession,
      getNextLevel,
    });
    if (progression.statusCode) return progression;

    const grading = await gradeAnswers(pool, questionIds, answers);
    if (grading.statusCode) return grading;
    const saved = await persistAttempt({
      pool,
      sessionId,
      userId,
      currentLevel: progression.currentLevel,
      nextLevel: progression.nextLevel,
      grading,
    });
    if (saved.statusCode) return saved;

    const updated = await pool.query(
      `SELECT id, first_name, last_name, username, phone, cefr_level, xp, rating, coins,
              current_streak, longest_streak
       FROM users WHERE id = $1`,
      [userId]
    );
    return outcome(200, {
      passed: grading.passed,
      overall_percent: grading.overallPercent,
      total_correct: grading.totalCorrect,
      total: grading.total,
      pass_overall_required: grading.passOverall,
      pass_skill_required: grading.passSkill,
      skill_results: grading.skillResults,
      old_level: progression.currentLevel,
      new_level: saved.newLevel,
      level_changed: grading.passed && progression.nextLevel !== null,
      updated_user: updated.rows[0],
    });
  }

  return { submitExam };
}

module.exports = { createExamSubmitService };
