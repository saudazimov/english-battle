function createStudentExamAttemptResultService({ pool }) {
  async function getAttemptResult(attemptId, studentId) {
    const result = await pool.query(
      `SELECT a.*, e.title, e.pass_percent, e.cefr_level
       FROM teacher_exam_attempts a JOIN teacher_exams e ON e.id = a.exam_id
       WHERE a.id = $1 AND a.student_id = $2`,
      [attemptId, studentId]
    );

    return result.rows[0] || null;
  }

  return { getAttemptResult };
}

module.exports = { createStudentExamAttemptResultService };
