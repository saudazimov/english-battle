function createStudentExamListService({ pool }) {
  async function listExams(studentId) {
    await pool.query(
      `UPDATE teacher_exams SET status = 'finished'
       WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < NOW()`
    );
    await pool.query(
      `UPDATE teacher_exams SET status = 'active'
       WHERE status = 'scheduled' AND (starts_at IS NULL OR starts_at <= NOW())`
    );

    const result = await pool.query(
      `SELECT e.id, e.title, e.description, e.cefr_level, e.skill, e.question_count,
              e.duration_minutes, e.pass_percent, e.max_attempts, e.starts_at, e.ends_at,
              e.status, c.name AS class_name,
              (SELECT COUNT(*) FROM teacher_exam_attempts a
                WHERE a.exam_id = e.id AND a.student_id = $1 AND a.status = 'submitted')::int AS my_attempts,
              (SELECT a.id FROM teacher_exam_attempts a
                WHERE a.exam_id = e.id AND a.student_id = $1 AND a.status = 'in_progress'
                ORDER BY a.started_at DESC LIMIT 1) AS in_progress_id,
              (SELECT a.percent FROM teacher_exam_attempts a
                WHERE a.exam_id = e.id AND a.student_id = $1 AND a.status = 'submitted'
                ORDER BY a.percent DESC LIMIT 1) AS best_percent
       FROM teacher_exams e
       JOIN classes c ON c.id = e.class_id
       JOIN class_students cs ON cs.class_id = c.id
       WHERE cs.student_id = $1 AND cs.status = 'active'
         AND e.status IN ('active', 'finished')
       ORDER BY e.status ASC, e.created_at DESC`,
      [studentId]
    );

    return result.rows;
  }

  return { listExams };
}

module.exports = { createStudentExamListService };
