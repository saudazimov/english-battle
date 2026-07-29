function mapStudent(row) {
  let display = "not_started";
  if (row.submission_status === "in_progress") display = "in_progress";
  else if (row.submission_status === "submitted") {
    display = row.is_late ? "late_submitted" : "submitted";
  }
  return {
    student_id: row.student_id,
    name: ((row.first_name || "") + " " + (row.last_name || "")).trim(),
    profile_picture: row.profile_picture || null,
    status: display,
    score: row.score,
    total: row.total,
    percent: row.percent,
    correct_count: row.correct_count,
    wrong_count: row.wrong_count,
    unanswered_count: row.unanswered_count,
    is_late: row.is_late || false,
    started_at: row.started_at,
    submitted_at: row.submitted_at,
  };
}

function buildSummary(students) {
  const totalStudents = students.length;
  const submittedList = students.filter(
    (student) => student.status === "submitted" || student.status === "late_submitted"
  );
  const submittedCount = submittedList.length;
  const lateCount = students.filter((student) => student.is_late).length;
  const notStartedCount = students.filter((student) => student.status === "not_started").length;
  const percents = submittedList
    .map((student) => student.percent)
    .filter((percent) => percent !== null && percent !== undefined);
  const averagePercent = percents.length
    ? Math.round(percents.reduce((sum, percent) => sum + percent, 0) / percents.length)
    : 0;

  return {
    total_students: totalStudents,
    submitted_count: submittedCount,
    late_count: lateCount,
    not_started_count: notStartedCount,
    completion_percent: totalStudents
      ? Math.round((submittedCount / totalStudents) * 100)
      : 0,
    average_percent: averagePercent,
    highest_percent: percents.length ? Math.max(...percents) : 0,
    lowest_percent: percents.length ? Math.min(...percents) : 0,
  };
}

function createTeacherAssignmentResultsService({ pool }) {
  async function getResults(assignmentId, teacherId) {
    const assignmentResult = await pool.query(
      `SELECT id, class_id, title, description, cefr_level, skill, question_count, due_at, status, created_at
       FROM assignments WHERE id = $1 AND teacher_id = $2`,
      [assignmentId, teacherId]
    );
    if (assignmentResult.rows.length === 0) return { status: "not-found" };
    const assignment = assignmentResult.rows[0];

    const studentsResult = await pool.query(
      `SELECT u.id AS student_id, u.first_name, u.last_name, u.profile_picture,
              s.status AS submission_status, s.score, s.total, s.percent,
              s.correct_count, s.wrong_count, s.unanswered_count,
              s.is_late, s.started_at, s.submitted_at
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
       LEFT JOIN assignment_submissions s
         ON s.assignment_id = $1 AND s.student_id = u.id
       WHERE cs.class_id = $2 AND cs.status = 'active'
       ORDER BY (s.percent IS NULL), s.percent DESC, u.first_name ASC`,
      [assignmentId, assignment.class_id]
    );
    const students = studentsResult.rows.map(mapStudent);

    return {
      status: "found",
      result: {
        assignment,
        summary: buildSummary(students),
        students,
      },
    };
  }

  return { getResults };
}

module.exports = { createTeacherAssignmentResultsService };
