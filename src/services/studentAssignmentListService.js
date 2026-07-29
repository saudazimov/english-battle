function createStudentAssignmentListService({ pool }) {
  return {
    async listAssignments(studentId) {
      const rows = await pool.query(
        `SELECT a.id, a.title, a.class_id, c.name AS class_name,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              a.cefr_level, a.skill, a.question_count, a.due_at, a.status,
              s.status AS submission_status, s.score, s.total, s.percent, s.is_late, s.submitted_at
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users t ON t.id = c.teacher_id
       JOIN assignments a ON a.class_id = c.id AND a.status = 'active'
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $1
       WHERE cs.student_id = $1 AND cs.status = 'active' AND c.archived_at IS NULL
       ORDER BY a.due_at NULLS LAST, a.created_at DESC`,
        [studentId]
      );

      return rows.rows.map((row) => {
        let display = "not_started";
        if (row.submission_status === "in_progress") display = "in_progress";
        else if (row.submission_status === "submitted") display = row.is_late ? "late_submitted" : "submitted";
        return {
          id: row.id, title: row.title, class_id: row.class_id, class_name: row.class_name,
          teacher_name: ((row.teacher_first_name || "") + " " + (row.teacher_last_name || "")).trim(),
          cefr_level: row.cefr_level, skill: row.skill, question_count: row.question_count,
          due_at: row.due_at, status: row.status,
          submission_status: display,
          score: row.score, total: row.total, percent: row.percent,
          is_late: row.is_late || false, submitted_at: row.submitted_at
        };
      });
    },
  };
}

module.exports = { createStudentAssignmentListService };
