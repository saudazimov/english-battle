function createTeacherClassListController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const classes = await pool.query(
        `SELECT c.id, c.name, c.description, c.join_code, c.created_at,
               COUNT(DISTINCT cs.student_id) FILTER (WHERE cs.status = 'active') AS student_count,
               COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active') AS active_assignments,
               ROUND(AVG(sub.percent)) AS avg_score,
               (SELECT COUNT(*) FROM assignment_submissions sx
                JOIN assignments ax ON ax.id=sx.assignment_id
                WHERE ax.class_id=c.id AND ax.status='active'
                  AND sx.status IN ('submitted','late_submitted')) AS completed_slots
       FROM classes c
       LEFT JOIN class_students cs ON cs.class_id = c.id
       LEFT JOIN assignments a ON a.class_id = c.id AND a.status = 'active'
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id
            AND sub.status IN ('submitted','late_submitted') AND sub.percent IS NOT NULL
       WHERE c.teacher_id = $1 AND c.archived_at IS NULL
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
        [req.user.id]
      );

      const classList = classes.rows;
      for (const classItem of classList) {
        const nextAssignment = await pool.query(
          `SELECT title, due_at FROM assignments
         WHERE class_id = $1 AND status = 'active' AND due_at >= NOW()
         ORDER BY due_at ASC LIMIT 1`,
          [classItem.id]
        );
        if (nextAssignment.rows.length > 0) {
          classItem.next_assignment_title = nextAssignment.rows[0].title;
          classItem.next_assignment_due = nextAssignment.rows[0].due_at;
        } else {
          classItem.next_assignment_title = null;
          classItem.next_assignment_due = null;
        }
        classItem.avg_score = classItem.avg_score != null ? Number(classItem.avg_score) : null;
        classItem.active_assignments = Number(classItem.active_assignments) || 0;
        classItem.student_count = Number(classItem.student_count) || 0;
        const expectedSlots = classItem.active_assignments * classItem.student_count;
        classItem.completion_percent = expectedSlots > 0
          ? Math.min(100, Math.round((Number(classItem.completed_slots || 0) / expectedSlots) * 100))
          : 0;
      }

      return res.json({ classes: classList });
    } catch (error) {
      logger.error("Sinflar ro'yxati xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createTeacherClassListController };
