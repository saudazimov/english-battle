function createTeacherStudentRosterService({ pool }) {
  return {
    async getClassStudents(classId, teacherId) {
      const classCheck = await pool.query(
        "SELECT id, name, description, join_code, created_at FROM classes WHERE id = $1 AND teacher_id = $2",
        [classId, teacherId]
      );
      if (classCheck.rows.length === 0) return null;

      const students = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture,
              cs.joined_at, cs.status
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
       WHERE cs.class_id = $1 AND cs.status = 'active'
       ORDER BY cs.joined_at DESC`,
        [classId]
      );
      return { class: classCheck.rows[0], students: students.rows };
    },

    async listStudents(teacherId) {
      const result = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.phone, u.cefr_level,
              c.id AS class_id, c.name AS class_name,
              -- O'rtacha natija (topshirilgan topshiriqlar)
              (SELECT ROUND(AVG(sub.percent)) FROM assignment_submissions sub
               WHERE sub.student_id = u.id AND sub.status IN ('submitted','late_submitted') AND sub.percent IS NOT NULL) AS avg_score,
              -- Bajarilgan topshiriqlar (shu sinfdagi)
              (SELECT COUNT(*)::int FROM assignment_submissions sub
               JOIN assignments a ON a.id = sub.assignment_id
               WHERE sub.student_id = u.id AND a.class_id = c.id AND sub.status IN ('submitted','late_submitted')) AS assignments_done,
              (SELECT COUNT(*)::int FROM assignments a WHERE a.class_id = c.id) AS assignments_total,
              -- Oxirgi 7 kunda faol kunlar (submission bo'yicha)
              (SELECT COUNT(DISTINCT DATE(sub.submitted_at)) FROM assignment_submissions sub
               WHERE sub.student_id = u.id AND sub.submitted_at >= NOW() - INTERVAL '7 days') AS active_days_7
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users u ON u.id = cs.student_id
       WHERE c.teacher_id = $1 AND c.archived_at IS NULL AND cs.status = 'active'
       ORDER BY u.first_name, u.last_name`,
        [teacherId]
      );

      const students = result.rows.map((student) => ({
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        phone: student.phone,
        cefr_level: student.cefr_level || "A1",
        class_id: student.class_id,
        class_name: student.class_name,
        avg_score: student.avg_score != null ? Number(student.avg_score) : null,
        assignments_done: Number(student.assignments_done) || 0,
        assignments_total: Number(student.assignments_total) || 0,
        active_days_7: Number(student.active_days_7) || 0,
      }));

      const total = students.length;
      const active = students.filter((student) => student.active_days_7 > 0).length;
      const withScore = students.filter((student) => student.avg_score != null);
      const averageScore = withScore.length
        ? Math.round(withScore.reduce((sum, student) => sum + student.avg_score, 0) / withScore.length)
        : null;
      let topScore = null, topName = null;
      withScore.forEach((student) => {
        if (topScore == null || student.avg_score > topScore) {
          topScore = student.avg_score;
          topName = ((student.first_name || "") + " " + (student.last_name || "")).trim()
            + (student.class_name ? " (" + student.class_name + ")" : "");
        }
      });
      const averageFrequency = total > 0
        ? Math.round((students.reduce((sum, student) => sum + student.active_days_7, 0) / total) * 10) / 10
        : null;

      const classMap = {};
      students.forEach((student) => {
        const key = student.class_name || "—";
        classMap[key] = (classMap[key] || 0) + 1;
      });
      const classDistribution = Object.keys(classMap).map((key) => ({
        class_name: key,
        count: classMap[key],
      }));

      const groups = { excellent: 0, good: 0, mid: 0, low: 0 };
      withScore.forEach((student) => {
        if (student.avg_score >= 90) groups.excellent++;
        else if (student.avg_score >= 75) groups.good++;
        else if (student.avg_score >= 50) groups.mid++;
        else groups.low++;
      });
      const scoreGroups = [
        { key: "excellent", count: groups.excellent },
        { key: "good", count: groups.good },
        { key: "mid", count: groups.mid },
        { key: "low", count: groups.low },
      ];

      return {
        students,
        stats: {
          total,
          active,
          avg_score: averageScore,
          top_score: topScore,
          top_name: topName,
          avg_frequency: averageFrequency,
        },
        class_distribution: classDistribution,
        score_groups: scoreGroups,
      };
    },
  };
}

module.exports = { createTeacherStudentRosterService };
