function createStudentExamAttemptAnswerService({ pool }) {
  async function saveAnswer({ attemptId, studentId, questionId, answer }) {
    const attemptResult = await pool.query(
      "SELECT * FROM teacher_exam_attempts WHERE id = $1 AND student_id = $2",
      [attemptId, studentId]
    );
    if (attemptResult.rows.length === 0) return "attempt-not-found";

    const attempt = attemptResult.rows[0];
    if (attempt.status !== "in_progress") return "exam-finished";
    if (attempt.expires_at && new Date(attempt.expires_at) < new Date()) return "expired";

    const answers = attempt.answers || {};
    answers[questionId] = (answer || "").toLowerCase();
    await pool.query(
      "UPDATE teacher_exam_attempts SET answers = $1 WHERE id = $2",
      [JSON.stringify(answers), attemptId]
    );

    return "saved";
  }

  return { saveAnswer };
}

module.exports = { createStudentExamAttemptAnswerService };
