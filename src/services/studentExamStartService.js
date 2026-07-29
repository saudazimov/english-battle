function createStudentExamStartService({ pool, gradeAttempt }) {
  async function startExam({ examId, studentId }) {
    const examResult = await pool.query(
      `SELECT e.* FROM teacher_exams e
       JOIN class_students cs ON cs.class_id = e.class_id
       WHERE e.id = $1 AND cs.student_id = $2 AND cs.status = 'active'`,
      [examId, studentId]
    );
    if (examResult.rows.length === 0) return { status: "exam-not-found" };
    const exam = examResult.rows[0];
    if (exam.status !== "active") return { status: "exam-inactive" };

    const ongoing = await pool.query(
      `SELECT * FROM teacher_exam_attempts
       WHERE exam_id = $1 AND student_id = $2 AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
      [examId, studentId]
    );

    if (ongoing.rows.length > 0) {
      const attempt = ongoing.rows[0];
      if (attempt.expires_at && new Date(attempt.expires_at) < new Date()) {
        await gradeAttempt(attempt.id);
        return { status: "attempt-expired" };
      }
      const questions = await pool.query(
        `SELECT id, q_order, question_text, option_a, option_b, option_c, option_d, skill
         FROM teacher_exam_questions WHERE exam_id = $1 ORDER BY q_order`,
        [examId]
      );
      const secondsLeft = Math.max(
        0,
        Math.floor((new Date(attempt.expires_at) - new Date()) / 1000)
      );
      return {
        status: "started",
        response: {
          attempt_id: attempt.id,
          resumed: true,
          exam: {
            title: exam.title,
            duration_minutes: exam.duration_minutes,
            question_count: exam.question_count,
          },
          questions: questions.rows,
          saved_answers: attempt.answers || {},
          seconds_left: secondsLeft,
        },
      };
    }

    const doneCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM teacher_exam_attempts
       WHERE exam_id = $1 AND student_id = $2 AND status IN ('submitted','expired')`,
      [examId, studentId]
    );
    if (doneCount.rows[0].c >= exam.max_attempts) {
      return { status: "attempts-exhausted", maxAttempts: exam.max_attempts };
    }

    const expiresAt = new Date(Date.now() + exam.duration_minutes * 60 * 1000);
    const attemptResult = await pool.query(
      `INSERT INTO teacher_exam_attempts
        (exam_id, student_id, attempt_number, status, started_at, expires_at, total)
       VALUES ($1, $2, $3, 'in_progress', NOW(), $4, $5)
       RETURNING id`,
      [examId, studentId, doneCount.rows[0].c + 1, expiresAt, exam.question_count]
    );
    const questions = await pool.query(
      `SELECT id, q_order, question_text, option_a, option_b, option_c, option_d, skill
       FROM teacher_exam_questions WHERE exam_id = $1 ORDER BY q_order`,
      [examId]
    );

    return {
      status: "started",
      response: {
        attempt_id: attemptResult.rows[0].id,
        resumed: false,
        exam: {
          title: exam.title,
          duration_minutes: exam.duration_minutes,
          question_count: exam.question_count,
        },
        questions: questions.rows,
        saved_answers: {},
        seconds_left: exam.duration_minutes * 60,
      },
    };
  }

  return { startExam };
}

module.exports = { createStudentExamStartService };
