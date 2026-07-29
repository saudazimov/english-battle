function createExamHistoryService({ pool }) {
  async function listAttempts(userId) {
    const result = await pool.query(
      `SELECT id, exam_type, from_level, to_level, total_questions, total_correct, overall_percent,
              pass_overall_required, pass_skill_required, skill_results, passed, level_changed, taken_at
       FROM exam_attempts
       WHERE user_id = $1
       ORDER BY taken_at DESC
       LIMIT 50`,
      [userId]
    );

    return result.rows.map((attempt) => ({
      id: attempt.id,
      exam_type: attempt.exam_type,
      from_level: attempt.from_level,
      to_level: attempt.to_level,
      total_questions: attempt.total_questions,
      total_correct: attempt.total_correct,
      overall_percent: attempt.overall_percent,
      pass_overall_required: attempt.pass_overall_required,
      pass_skill_required: attempt.pass_skill_required,
      skill_results: attempt.skill_results || {},
      passed: attempt.passed,
      level_changed: attempt.level_changed,
      taken_at: attempt.taken_at,
    }));
  }

  return { listAttempts };
}

module.exports = { createExamHistoryService };
