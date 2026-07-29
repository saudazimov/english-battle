function createTeacherExamListService({ pool }) {
  async function listExams(teacherId) {
    await pool.query(
      `UPDATE teacher_exams SET status = 'active'
       WHERE teacher_id = $1 AND status = 'scheduled' AND (starts_at IS NULL OR starts_at <= NOW())`,
      [teacherId]
    );
    await pool.query(
      `UPDATE teacher_exams SET status = 'finished'
       WHERE teacher_id = $1 AND status = 'active' AND ends_at IS NOT NULL AND ends_at < NOW()`,
      [teacherId]
    );

    const result = await pool.query(
      `SELECT e.id, e.title, e.description, e.cefr_level, e.skill, e.question_count,
              e.duration_minutes, e.pass_percent, e.max_attempts, e.starts_at, e.ends_at,
              e.status, e.created_at, e.class_id,
              c.name AS class_name,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = e.class_id AND cs.status = 'active')::int AS class_student_count,
              (SELECT COUNT(*) FROM teacher_exam_attempts a WHERE a.exam_id = e.id AND a.status = 'submitted')::int AS submitted_count,
              (SELECT ROUND(AVG(a.percent)) FROM teacher_exam_attempts a WHERE a.exam_id = e.id AND a.status = 'submitted')::int AS avg_percent
       FROM teacher_exams e
       LEFT JOIN classes c ON c.id = e.class_id
       WHERE e.teacher_id = $1
       ORDER BY e.created_at DESC`,
      [teacherId]
    );

    const rows = result.rows;
    const total = rows.length;
    const active = rows.filter((row) => row.status === "active").length;
    const finished = rows.filter((row) => row.status === "finished").length;
    const avgDuration = total > 0
      ? Math.round(rows.reduce((sum, row) => sum + (row.duration_minutes || 0), 0) / total)
      : 0;
    const submittedExams = rows.filter((row) => row.avg_percent != null);
    const avgScore = submittedExams.length > 0
      ? Math.round(submittedExams.reduce((sum, row) => sum + row.avg_percent, 0) / submittedExams.length)
      : 0;

    return {
      exams: rows,
      stats: {
        total,
        active,
        finished,
        avg_score: avgScore,
        avg_duration: avgDuration,
      },
    };
  }

  return { listExams };
}

module.exports = { createTeacherExamListService };
