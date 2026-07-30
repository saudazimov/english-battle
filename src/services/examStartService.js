async function replaceActiveExamSession({ pool, sessionId, userId, currentLevel, questionIds }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    await client.query(
      "UPDATE exam_sessions SET status='expired' WHERE user_id=$1 AND status='active'",
      [userId]
    );
    await client.query(
      `INSERT INTO exam_sessions (id, user_id, from_level, question_ids, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 minutes')`,
      [sessionId, userId, currentLevel, questionIds]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function createExamStartService({ pool, randomUUID }) {
  async function startExam(userId) {
    const userResult = await pool.query(
      "SELECT cefr_level FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) return { status: "user-not-found" };

    const currentLevel = userResult.rows[0].cefr_level;
    const questionResult = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, skill
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT 20`,
      [currentLevel]
    );
    if (questionResult.rows.length < 10) return { status: "insufficient-questions" };

    const sessionId = randomUUID();
    await replaceActiveExamSession({
      pool,
      sessionId,
      userId,
      currentLevel,
      questionIds: questionResult.rows.map((question) => Number(question.id)),
    });

    return {
      status: "started",
      result: {
        session_id: sessionId,
        level: currentLevel,
        total: questionResult.rows.length,
        questions: questionResult.rows,
      },
    };
  }

  return { startExam };
}

module.exports = { createExamStartService };
