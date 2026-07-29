function mapBattle(row) {
  return {
    played_at: row.played_at,
    result: row.outcome,
    score: (row.my_score != null ? row.my_score : 0) + " : " + (row.opponent_score != null ? row.opponent_score : 0),
    opponent_label: "Raqib",
    mode: row.mode,
    question_count: row.total_questions || null,
  };
}

function mapExam(row) {
  return {
    from_level: row.from_level,
    to_level: row.to_level,
    overall_percent: row.overall_percent,
    passed: row.passed,
    level_changed: row.level_changed,
    taken_at: row.taken_at,
  };
}

function mapAssignment(row) {
  let status = "not_started";
  if (row.sub_status === "in_progress") status = "in_progress";
  else if (row.sub_status === "submitted") status = row.is_late ? "late_submitted" : "submitted";
  return {
    title: row.title,
    class_name: row.class_name,
    teacher_name: ((row.tf || "") + " " + (row.tl || "")).trim(),
    due_at: row.due_at,
    status,
    score: row.score,
    percent: row.percent,
    is_late: !!row.is_late,
    submitted_at: row.submitted_at,
  };
}

async function loadDetailRows(pool, studentId) {
  const battles = await pool.query(
    "SELECT played_at, outcome, my_score, opponent_score, mode, total_questions FROM battle_history WHERE user_id=$1 ORDER BY played_at DESC LIMIT 10",
    [studentId]
  );
  const assignments = await pool.query(
    `SELECT a.id, a.title, c.name AS class_name, t.first_name AS tf, t.last_name AS tl,
            a.cefr_level, a.skill, a.question_count, a.due_at,
            s.status AS sub_status, s.score, s.total, s.percent, s.is_late, s.submitted_at
     FROM class_students cs
     JOIN classes c ON c.id = cs.class_id
     JOIN users t ON t.id = c.teacher_id
     JOIN assignments a ON a.class_id = c.id AND a.status='active'
     LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $1
     WHERE cs.student_id = $1 AND cs.status='active' AND c.archived_at IS NULL
     ORDER BY a.due_at NULLS LAST, a.created_at DESC LIMIT 30`,
    [studentId]
  );
  const weakAreas = await pool.query(
    `SELECT aq.skill, COUNT(*)::int AS attempts, SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
     FROM submission_answers sa
     JOIN assignment_submissions s ON s.id = sa.submission_id AND s.student_id = $1 AND s.status='submitted'
     JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
     WHERE aq.skill IS NOT NULL AND aq.skill <> ''
     GROUP BY aq.skill
     HAVING COUNT(*) >= 3
     ORDER BY (SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::float / COUNT(*)) ASC`,
    [studentId]
  );
  const exams = await pool.query(
    `SELECT from_level, to_level, overall_percent, passed, level_changed, taken_at
     FROM exam_attempts WHERE user_id = $1 ORDER BY taken_at DESC LIMIT 20`,
    [studentId]
  );
  return { battles, assignments, weakAreas, exams };
}

function createParentChildDetailService({ pool, parentLeagueName, activityLabel }) {
  async function getChildDetail({ parentId, studentId }) {
    const link = await pool.query(
      "SELECT relationship, linked_at FROM parent_links WHERE parent_id=$1 AND student_id=$2 AND status='active'",
      [parentId, studentId]
    );
    if (link.rows.length === 0) return { status: "forbidden" };

    const userResult = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.xp, u.school, u.is_banned, u.current_streak,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.student_id=u.id AND cs.status='active')::int AS class_count
       FROM users u WHERE u.id = $1`,
      [studentId]
    );
    if (userResult.rows.length === 0) return { status: "not-found" };
    const user = userResult.rows[0];

    const battleStats = await pool.query(
      `SELECT COUNT(*)::int AS total,
              SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END)::int AS wins,
              COALESCE(SUM(my_score),0)::int AS correct_sum,
              COALESCE(SUM(total_questions),0)::int AS q_sum,
              SUM(CASE WHEN played_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS weekly,
              MAX(played_at) AS last_played
       FROM battle_history WHERE user_id = $1`,
      [studentId]
    );
    const stats = battleStats.rows[0];
    const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;
    const accuracy = stats.q_sum > 0
      ? Math.min(100, Math.round((stats.correct_sum / stats.q_sum) * 100))
      : null;

    const { battles, assignments, weakAreas, exams } = await loadDetailRows(pool, studentId);

    return {
      status: "found",
      detail: {
        child: {
          id: user.id,
          name: ((user.first_name || "") + " " + (user.last_name || "")).trim() || "Farzand",
          cefr_level: user.cefr_level || "A1",
          league: parentLeagueName(user.rating),
          rating: user.rating || 0,
          xp: user.xp || 0,
          school_name: user.school || null,
          class_count: user.class_count,
          is_banned: !!user.is_banned,
          relationship: link.rows[0].relationship,
          linked_at: link.rows[0].linked_at,
        },
        overview: {
          total_battles: stats.total,
          win_rate: winRate,
          accuracy,
          current_streak: user.current_streak || 0,
          weekly_activity_count: stats.weekly,
          last_activity_label: activityLabel(stats.last_played),
        },
        battles: battles.rows.map(mapBattle),
        exams: exams.rows.map(mapExam),
        assignments: assignments.rows.map(mapAssignment),
        weak_areas: weakAreas.rows.map((row) => ({
          skill: row.skill,
          accuracy: row.attempts > 0 ? Math.round((row.correct / row.attempts) * 100) : 0,
          attempts: row.attempts,
        })),
      },
    };
  }

  return { getChildDetail };
}

module.exports = { createParentChildDetailService, mapBattle, mapExam, mapAssignment };
