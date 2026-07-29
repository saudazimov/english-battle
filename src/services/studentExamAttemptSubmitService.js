function createStudentExamAttemptSubmitService({ pool, gradeAttempt }) {
  async function submitAttempt({ attemptId, studentId, body }) {
    const attemptResult = await pool.query(
      "SELECT * FROM teacher_exam_attempts WHERE id = $1 AND student_id = $2",
      [attemptId, studentId]
    );
    if (attemptResult.rows.length === 0) return { status: "attempt-not-found" };
    if (attemptResult.rows[0].status !== "in_progress") {
      return { status: "already-finished" };
    }

    if (body && body.answers && typeof body.answers === "object") {
      const merged = Object.assign({}, attemptResult.rows[0].answers || {}, body.answers);
      await pool.query(
        "UPDATE teacher_exam_attempts SET answers = $1 WHERE id = $2",
        [JSON.stringify(merged), attemptId]
      );
    }

    const result = await gradeAttempt(attemptId);
    return { status: "submitted", result };
  }

  return { submitAttempt };
}

module.exports = { createStudentExamAttemptSubmitService };
