function createTeacherDashboardController({ pool, logger = console }) {
  async function getDashboard(req, res) {
    try {
      const teacherId = req.user.id;

      const teacher = await pool.query(
        "SELECT id, first_name, last_name, school, profile_picture FROM users WHERE id = $1",
        [teacherId]
      );
      const classCount = await pool.query(
        "SELECT COUNT(*) AS count FROM classes WHERE teacher_id = $1 AND archived_at IS NULL",
        [teacherId]
      );
      const studentCount = await pool.query(
        `SELECT COUNT(DISTINCT cs.student_id) AS count
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       WHERE c.teacher_id = $1 AND c.archived_at IS NULL AND cs.status = 'active'`,
        [teacherId]
      );
      const activeAssignments = await pool.query(
        "SELECT COUNT(*)::int AS count FROM assignments WHERE teacher_id=$1 AND status='active'",
        [teacherId]
      );
      const averagePerformance = await pool.query(
        `SELECT ROUND(AVG(s.percent))::int AS average
       FROM assignment_submissions s
       JOIN assignments a ON a.id=s.assignment_id
       WHERE a.teacher_id=$1 AND s.status IN ('submitted','late_submitted')`,
        [teacherId]
      );
      const stats = {
        totalClasses: parseInt(classCount.rows[0].count, 10),
        totalStudents: parseInt(studentCount.rows[0].count, 10),
        activeAssignments: Number(activeAssignments.rows[0].count) || 0,
        averagePerformance: Number(averagePerformance.rows[0].average) || 0,
      };

      return res.json({
        teacher: teacher.rows[0] || null,
        stats: stats,
      });
    } catch (error) {
      logger.error("Teacher dashboard xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getDashboard };
}

module.exports = { createTeacherDashboardController };
