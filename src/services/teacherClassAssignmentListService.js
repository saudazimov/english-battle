function createTeacherClassAssignmentListService({ pool }) {
  async function listAssignments({ classId, teacherId, statusFilter }) {
    const classResult = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, teacherId]
    );
    if (classResult.rows.length === 0) return null;

    let where = "a.class_id = $1";
    if (statusFilter === "archived") where += " AND a.status = 'archived'";
    else if (statusFilter !== "all") where += " AND a.status = 'active'";

    const result = await pool.query(
      `SELECT a.id, a.title, a.description, a.cefr_level, a.skill, a.question_count, a.due_at, a.status, a.created_at,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = a.class_id AND cs.status='active') AS total_students,
              (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status='submitted') AS submitted_count,
              (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status='submitted' AND s.is_late) AS late_count,
              (SELECT COUNT(DISTINCT s.student_id) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS started_count,
              (SELECT COALESCE(ROUND(AVG(s.percent)),0) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status='submitted') AS average_percent
       FROM assignments a
       WHERE ${where}
       ORDER BY a.created_at DESC`,
      [classId]
    );

    return result.rows.map((row) => {
      const total = parseInt(row.total_students);
      const started = parseInt(row.started_count);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        cefr_level: row.cefr_level,
        skill: row.skill,
        question_count: row.question_count,
        due_at: row.due_at,
        status: row.status,
        created_at: row.created_at,
        total_students: total,
        submitted_count: parseInt(row.submitted_count),
        late_count: parseInt(row.late_count),
        not_started_count: Math.max(0, total - started),
        average_percent: parseInt(row.average_percent),
      };
    });
  }

  return { listAssignments };
}

module.exports = { createTeacherClassAssignmentListService };
