function createTeacherAssignmentListService({ pool, now = () => new Date() }) {
  return {
    async listAssignments(teacherId) {
      const assignmentResult = await pool.query(
        `SELECT a.id, a.title, a.description, a.cefr_level, a.skill, a.question_count,
              a.due_at, a.status, a.created_at, a.class_id,
              c.name AS class_name,
              (SELECT COUNT(*)::int FROM class_students cs WHERE cs.class_id = a.class_id AND cs.status = 'active') AS class_student_count,
              (SELECT COUNT(DISTINCT sub.student_id)::int
               FROM assignment_submissions sub
               WHERE sub.assignment_id = a.id
                 AND sub.status IN ('submitted','late_submitted')) AS submitted_count
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       WHERE a.teacher_id = $1 AND c.archived_at IS NULL
       ORDER BY a.created_at DESC`,
        [teacherId]
      );

      const assignments = assignmentResult.rows.map((assignment) => {
        const total = assignment.class_student_count || 0;
        const done = assignment.submitted_count || 0;
        const completion = total > 0 ? Math.round((done / total) * 100) : 0;
        return {
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          cefr_level: assignment.cefr_level,
          skill: assignment.skill,
          question_count: assignment.question_count,
          due_at: assignment.due_at,
          status: assignment.status,
          class_id: assignment.class_id,
          class_name: assignment.class_name,
          class_student_count: total,
          submitted_count: done,
          total_students: total,
          completion_percent: completion,
        };
      });

      const total = assignments.length;
      const active = assignments.filter((assignment) => assignment.status === "active").length;
      const currentTime = now();
      const soon = assignments.filter((assignment) => {
        if (!assignment.due_at || assignment.status !== "active") return false;
        const days = Math.ceil((new Date(assignment.due_at) - currentTime) / 86400000);
        return days >= 0 && days <= 3;
      }).length;
      const withCompletion = assignments.filter((assignment) => assignment.total_students > 0);
      const averageCompletion = withCompletion.length
        ? Math.round(withCompletion.reduce((sum, assignment) => sum + assignment.completion_percent, 0) / withCompletion.length)
        : null;

      const dueSoon = assignments
        .filter((assignment) => assignment.due_at && assignment.status === "active")
        .sort((left, right) => new Date(left.due_at) - new Date(right.due_at))
        .slice(0, 5)
        .map((assignment) => ({
          id: assignment.id,
          title: assignment.title,
          class_name: assignment.class_name,
          due_at: assignment.due_at,
        }));

      const classMap = {};
      assignments.forEach((assignment) => {
        if (!classMap[assignment.class_id]) {
          classMap[assignment.class_id] = {
            class_name: assignment.class_name,
            sum: 0,
            cnt: 0,
          };
        }
        if (assignment.total_students > 0) {
          classMap[assignment.class_id].sum += assignment.completion_percent;
          classMap[assignment.class_id].cnt++;
        }
      });
      const classCompletion = Object.values(classMap).map((entry) => ({
        class_name: entry.class_name,
        completion: entry.cnt > 0 ? Math.round(entry.sum / entry.cnt) : 0,
      }));

      return {
        assignments,
        stats: { total, active, soon, avg_completion: averageCompletion },
        due_soon: dueSoon,
        class_completion: classCompletion,
      };
    },
  };
}

module.exports = { createTeacherAssignmentListService };
