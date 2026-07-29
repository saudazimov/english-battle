function createStudentClassViewingService({ pool, activeClassMembership }) {
  return {
    async listClasses(studentId) {
      const classes = await pool.query(
        `SELECT c.id, c.name, c.description, c.join_code, c.cefr_level, c.created_at, c.schedule, c.teacher_id,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              (SELECT COUNT(*) FROM class_students m WHERE m.class_id = c.id AND m.status = 'active') AS student_count
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users t ON t.id = c.teacher_id
       WHERE cs.student_id = $1 AND cs.status = 'active' AND c.archived_at IS NULL
       ORDER BY cs.joined_at DESC`,
        [studentId]
      );
      return classes.rows;
    },

    async getRanking(classId, studentId) {
      if (!(await activeClassMembership(classId, studentId))) return null;
      const rows = await pool.query(
        `WITH best_submissions AS (
         SELECT DISTINCT ON (s.student_id, s.assignment_id)
                s.student_id, s.assignment_id, s.percent
           FROM assignment_submissions s
           JOIN assignments a ON a.id=s.assignment_id
          WHERE a.class_id=$1 AND s.status IN ('submitted','late_submitted')
          ORDER BY s.student_id, s.assignment_id, s.percent DESC NULLS LAST, s.submitted_at DESC
       ), scores AS (
         SELECT student_id, ROUND(AVG(percent))::int AS avg_percent, COUNT(*)::int AS completed
           FROM best_submissions GROUP BY student_id
       )
       SELECT u.id, u.first_name, u.last_name, u.profile_picture, u.rating,
              COALESCE(sc.avg_percent,0) AS avg_percent, COALESCE(sc.completed,0) AS completed
         FROM class_students cs
         JOIN users u ON u.id=cs.student_id
         LEFT JOIN scores sc ON sc.student_id=u.id
        WHERE cs.class_id=$1 AND cs.status='active'
        ORDER BY COALESCE(sc.avg_percent,0) DESC, COALESCE(sc.completed,0) DESC,
                 COALESCE(u.rating,0) DESC, u.id ASC`,
        [classId]
      );
      const ranking = rows.rows.map((row, index) => ({ ...row, rank: index + 1 }));
      return {
        ranking,
        my_rank: (ranking.find((row) => row.id === studentId) || {}).rank || null,
      };
    },
  };
}

module.exports = { createStudentClassViewingService };
