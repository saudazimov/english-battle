function createPracticeStartHandler({ pool, crypto, logger }) {
  return async function startPractice(req, res) {
    try {
      let level = (req.query.level || req.user.cefr_level || "A1").trim();
      let count = parseInt(req.query.count) || 10;
      if (count < 5) count = 5;
      if (count > 30) count = 30;

      const validLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
      if (validLevels.indexOf(level) === -1) level = "A1";
      const result = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, skill
         FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2`,
        [level, count]
      );
      if (result.rows.length < count) {
        const extra = await pool.query(
          `SELECT id, question_text, option_a, option_b, option_c, option_d, skill
           FROM questions WHERE cefr_level != $1 ORDER BY RANDOM() LIMIT $2`,
          [level, count - result.rows.length]
        );
        result.rows = result.rows.concat(extra.rows);
      }
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Hozircha savollar mavjud emas" });
      }

      const sessionId = crypto.randomUUID();
      const questionIds = result.rows.map((question) => Number(question.id));
      await pool.query(
        `INSERT INTO practice_sessions (id, user_id, level, question_ids, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '60 minutes')`,
        [sessionId, req.user.id, level, questionIds]
      );
      res.json({
        session_id: sessionId,
        level,
        total: result.rows.length,
        questions: result.rows,
      });
    } catch (error) {
      logger.error("Practice start xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createPracticeAnswerHandler({ pool, logger }) {
  return async function answerPractice(req, res) {
    const client = await pool.connect();
    try {
      const sessionId = String(req.body.session_id || "");
      const questionId = parseInt(req.body.question_id, 10);
      const answer = String(req.body.answer || "").toUpperCase();
      if (!sessionId || !questionId || !["A", "B", "C", "D"].includes(answer)) {
        return res.status(400).json({ error: "Noto'g'ri javob ma'lumoti" });
      }

      await client.query("BEGIN");
      const sessionResult = await client.query(
        `SELECT * FROM practice_sessions
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [sessionId, req.user.id]
      );
      const session = sessionResult.rows[0];
      if (!session || session.status !== "active") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Practice sessiyasi faol emas" });
      }
      if (new Date(session.expires_at) < new Date()) {
        await client.query(
          "UPDATE practice_sessions SET status='expired' WHERE id=$1",
          [sessionId]
        );
        await client.query("COMMIT");
        return res
          .status(400)
          .json({ error: "Practice sessiyasi muddati tugagan" });
      }

      const questionIds = (session.question_ids || []).map(Number);
      const answeredIds = (session.answered_ids || []).map(Number);
      if (!questionIds.includes(questionId)) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Savol bu sessiyaga tegishli emas" });
      }
      if (answeredIds.includes(questionId)) {
        await client.query("ROLLBACK");
        return res
          .status(409)
          .json({ error: "Bu savolga allaqachon javob berilgan" });
      }

      const questionResult = await client.query(
        "SELECT correct_option, explanation FROM questions WHERE id = $1",
        [questionId]
      );
      if (!questionResult.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Savol topilmadi" });
      }
      const question = questionResult.rows[0];
      const isCorrect = answer === question.correct_option;
      const updated = await client.query(
        `UPDATE practice_sessions
         SET answered_ids = array_append(answered_ids, $1::integer),
             correct_count = correct_count + $2
         WHERE id = $3
         RETURNING correct_count, cardinality(answered_ids) AS answered_count`,
        [questionId, isCorrect ? 1 : 0, sessionId]
      );
      await client.query("COMMIT");
      res.json({
        is_correct: isCorrect,
        correct_option: question.correct_option,
        explanation: question.explanation || null,
        correct_count: updated.rows[0].correct_count,
        answered_count: updated.rows[0].answered_count,
        total: questionIds.length,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Practice answer xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    } finally {
      client.release();
    }
  };
}

function createPracticeFinishHandler({ pool, updateQuestProgress, logger }) {
  return async function finishPractice(req, res) {
    const client = await pool.connect();
    try {
      const userId = req.user.id;
      const sessionId = String(req.body.session_id || "");
      if (!sessionId) {
        return res.status(400).json({ error: "Practice sessiyasi topilmadi" });
      }

      await client.query("BEGIN");
      const sessionResult = await client.query(
        `SELECT * FROM practice_sessions
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`,
        [sessionId, userId]
      );
      const session = sessionResult.rows[0];
      if (!session || session.status !== "active") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Practice sessiyasi faol emas" });
      }
      const total = (session.question_ids || []).length;
      const answered = (session.answered_ids || []).length;
      const correct = Number(session.correct_count) || 0;
      if (total <= 0 || answered !== total) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Barcha savollarga javob bering" });
      }

      const xpEarned = correct * 2;
      await client.query(
        "UPDATE practice_sessions SET status='finished', finished_at=NOW() WHERE id=$1",
        [sessionId]
      );
      const updated = await client.query(
        "UPDATE users SET xp = xp + $1 WHERE id = $2 RETURNING id, xp, cefr_level, rating",
        [xpEarned, userId]
      );
      await client.query("COMMIT");
      await updateQuestProgress(userId, {
        won: false,
        correctAnswers: correct,
        xpEarned,
      });
      res.json({
        xp_earned: xpEarned,
        correct,
        total,
        updated_user: updated.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Practice finish xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    } finally {
      client.release();
    }
  };
}

function createPracticeController(dependencies) {
  const shared = { ...dependencies, logger: dependencies.logger || console };
  return {
    start: createPracticeStartHandler(shared),
    answer: createPracticeAnswerHandler(shared),
    finish: createPracticeFinishHandler(shared),
  };
}

module.exports = { createPracticeController };
