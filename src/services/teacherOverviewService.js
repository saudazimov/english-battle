function emptyOverview() {
  return {
    stats: { total_students: 0, completion_rate: 0, avg_score: 0, active_students: 0 },
    chart: { labels: [], assignments: [], exams: [] },
    upcoming_tasks: [],
    recent_activity: [],
    calendar_dates: [],
  };
}

async function loadOverviewStats(pool, classIds) {
  const students = await pool.query(
    `SELECT COUNT(DISTINCT student_id)::int AS c
       FROM class_students WHERE class_id = ANY($1) AND status = 'active'`,
    [classIds]
  );
  const totalStudents = students.rows[0].c;
  const completion = await pool.query(
    `SELECT
         COUNT(*) FILTER (WHERE s.status IN ('submitted','late_submitted'))::int AS submitted,
         COUNT(DISTINCT a.id)::int AS total_assignments
       FROM assignments a
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
       WHERE a.class_id = ANY($1) AND a.status = 'active'
         AND a.created_at >= NOW() - INTERVAL '30 days'`,
    [classIds]
  );
  const submitted = completion.rows[0].submitted || 0;
  const totalAssignments = completion.rows[0].total_assignments || 0;
  const expected = totalAssignments * Math.max(totalStudents, 1);
  const completionRate = expected > 0 ? Math.round((submitted / expected) * 100) : 0;
  const average = await pool.query(
    `SELECT ROUND(AVG(s.percent))::int AS avg
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.class_id = ANY($1) AND s.status IN ('submitted','late_submitted') AND s.percent IS NOT NULL`,
    [classIds]
  );
  const active = await pool.query(
    `SELECT COUNT(DISTINCT student_id)::int AS c FROM (
         SELECT s.student_id FROM assignment_submissions s
           JOIN assignments a ON a.id = s.assignment_id
           WHERE a.class_id = ANY($1) AND s.submitted_at >= NOW() - INTERVAL '7 days'
         UNION
         SELECT cs.student_id FROM class_students cs
           JOIN battle_history bh ON bh.user_id = cs.student_id
           WHERE cs.class_id = ANY($1) AND bh.played_at >= NOW() - INTERVAL '7 days'
       ) AS active_union`,
    [classIds]
  );
  return {
    total_students: totalStudents,
    completion_rate: completionRate,
    avg_score: average.rows[0].avg || 0,
    active_students: active.rows[0].c,
  };
}

async function loadOverviewContent(pool, classIds) {
  const chart = await pool.query(
    `WITH events AS (
         SELECT DATE_TRUNC('day', s.submitted_at) AS d, 'assignment' AS kind
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         WHERE a.class_id = ANY($1) AND s.submitted_at >= NOW() - INTERVAL '30 days'
           AND s.status IN ('submitted','late_submitted')
         UNION ALL
         SELECT DATE_TRUNC('day', ta.submitted_at) AS d, 'exam' AS kind
         FROM teacher_exam_attempts ta
         JOIN teacher_exams e ON e.id = ta.exam_id
         WHERE e.class_id = ANY($1) AND ta.submitted_at >= NOW() - INTERVAL '30 days'
           AND ta.status = 'submitted'
       )
       SELECT TO_CHAR(d, 'DD Mon') AS day, d,
              COUNT(*) FILTER (WHERE kind='assignment')::int AS assignment_count,
              COUNT(*) FILTER (WHERE kind='exam')::int AS exam_count
       FROM events GROUP BY d ORDER BY d ASC`,
    [classIds]
  );
  const chartLabels = chart.rows.map((row) => row.day);
  const chartAssignments = chart.rows.map((row) => row.assignment_count);
  const chartExams = chart.rows.map((row) => row.exam_count);
  void chartExams;
  const tasks = await pool.query(
    `SELECT a.id, a.title, a.due_at, c.name AS class_name,
              COUNT(s.id) FILTER (WHERE s.status IN ('submitted','late_submitted'))::int AS submitted_count
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
       WHERE a.class_id = ANY($1) AND a.status = 'active'
       GROUP BY a.id, a.title, a.due_at, c.name
       HAVING COUNT(s.id) FILTER (WHERE s.status IN ('submitted','late_submitted')) > 0
       ORDER BY a.due_at ASC NULLS LAST
       LIMIT 5`,
    [classIds]
  );
  const feed = await pool.query(
    `SELECT s.percent, s.submitted_at, a.title AS assignment_title,
              c.name AS class_name,
              (u.first_name || ' ' || COALESCE(u.last_name,'')) AS student_name
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN classes c ON c.id = a.class_id
       JOIN users u ON u.id = s.student_id
       WHERE a.class_id = ANY($1) AND s.status IN ('submitted','late_submitted')
       ORDER BY s.submitted_at DESC LIMIT 6`,
    [classIds]
  );
  const calendar = await pool.query(
    `SELECT DISTINCT due_at
       FROM assignments
       WHERE class_id = ANY($1) AND due_at IS NOT NULL
         AND due_at >= NOW() - INTERVAL '60 days'
         AND due_at <= NOW() + INTERVAL '60 days'`,
    [classIds]
  );
  return {
    chart: { labels: chartLabels, assignments: chartAssignments },
    upcoming_tasks: tasks.rows.map((row) => ({
      id: row.id,
      title: row.title,
      class_name: row.class_name,
      submitted_count: row.submitted_count,
      due_at: row.due_at,
    })),
    recent_activity: feed.rows.map((row) => ({
      student_name: (row.student_name || "").trim(),
      assignment_title: row.assignment_title,
      class_name: row.class_name,
      percent: row.percent,
      submitted_at: row.submitted_at,
    })),
    calendar_dates: calendar.rows.map((row) => row.due_at),
  };
}

function createTeacherOverviewService({ pool }) {
  async function getOverview(teacherId) {
    const classes = await pool.query(
      "SELECT id FROM classes WHERE teacher_id = $1 AND archived_at IS NULL",
      [teacherId]
    );
    const classIds = classes.rows.map((row) => row.id);
    if (classIds.length === 0) return emptyOverview();
    const stats = await loadOverviewStats(pool, classIds);
    const content = await loadOverviewContent(pool, classIds);
    return { stats, ...content };
  }

  return { getOverview };
}

module.exports = { createTeacherOverviewService, emptyOverview };
