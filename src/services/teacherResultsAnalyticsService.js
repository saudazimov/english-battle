function mapStudent(row) {
  let timeSeconds = null;
  if (row.started_at && row.submitted_at) {
    timeSeconds = Math.max(
      0,
      Math.round((new Date(row.submitted_at) - new Date(row.started_at)) / 1000)
    );
  }

  return {
    student_id: row.student_id,
    name: ((row.first_name || "") + " " + (row.last_name || "")).trim(),
    class_name: row.class_name,
    score: row.score,
    total: row.total,
    percent: row.percent,
    correct_count: row.correct_count,
    wrong_count: row.wrong_count,
    unanswered_count: row.unanswered_count,
    is_late: row.is_late,
    time_seconds: timeSeconds,
  };
}

function buildStats(students, totalStudents) {
  const submitted = students.length;
  const scores = students.map((student) => student.percent).filter((percent) => percent != null);
  const avgScore = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : null;
  let topScore = null;
  let topName = null;
  let lowScore = null;
  let lowName = null;

  students.forEach((student) => {
    if (topScore == null || student.percent > topScore) {
      topScore = student.percent;
      topName = student.name;
    }
    if (lowScore == null || student.percent < lowScore) {
      lowScore = student.percent;
      lowName = student.name;
    }
  });

  const late = students.filter((student) => student.is_late).length;
  return {
    total: totalStudents,
    avg_score: avgScore,
    top_score: topScore,
    top_name: topName,
    low_score: lowScore,
    low_name: lowName,
    submitted,
    submit_rate: totalStudents > 0 ? Math.round((submitted / totalStudents) * 100) : 0,
    late,
    late_rate: submitted > 0 ? Math.round((late / submitted) * 100) : 0,
  };
}

function buildDistribution(students) {
  const counts = { excellent: 0, good: 0, mid: 0, low: 0 };
  students.forEach((student) => {
    if (student.percent >= 90) counts.excellent++;
    else if (student.percent >= 75) counts.good++;
    else if (student.percent >= 50) counts.mid++;
    else counts.low++;
  });

  return [
    { label: "A'lo (90-100%)", count: counts.excellent, color: "#16b06a" },
    { label: "Yaxshi (75-89%)", count: counts.good, color: "#2f6bff" },
    { label: "O'rta (50-74%)", count: counts.mid, color: "#f59e0b" },
    { label: "Past (<50%)", count: counts.low, color: "#ef4655" },
  ];
}

function buildClassComparison(students) {
  const classMap = {};
  students.forEach((student) => {
    const className = student.class_name || "—";
    if (!classMap[className]) classMap[className] = { sum: 0, cnt: 0 };
    classMap[className].sum += student.percent;
    classMap[className].cnt++;
  });

  return Object.keys(classMap).map((className) => ({
    class_name: className,
    avg: classMap[className].cnt > 0
      ? classMap[className].sum / classMap[className].cnt
      : 0,
  }));
}

const difficultyMeta = {
  easy: { label: "Oson", color: "#16b06a" },
  oson: { label: "Oson", color: "#16b06a" },
  medium: { label: "O'rta", color: "#2f6bff" },
  "o'rta": { label: "O'rta", color: "#2f6bff" },
  orta: { label: "O'rta", color: "#2f6bff" },
  hard: { label: "Qiyin", color: "#ef4655" },
  qiyin: { label: "Qiyin", color: "#ef4655" },
};

function mapDifficulty(row) {
  const key = (row.difficulty || "").toLowerCase();
  const meta = difficultyMeta[key] || { label: row.difficulty, color: "#94a3b8" };
  return { label: meta.label, count: row.question_count, color: meta.color };
}

async function loadAnswerAnalytics(pool, assignmentId) {
  const skillResult = await pool.query(
    `SELECT aq.skill,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE sa.is_correct)::int AS correct
     FROM submission_answers sa
     JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
     JOIN assignment_submissions sub ON sub.id = sa.submission_id
     WHERE sub.assignment_id = $1 AND sub.status IN ('submitted','late_submitted')
       AND aq.skill IS NOT NULL
     GROUP BY aq.skill
     ORDER BY aq.skill`,
    [assignmentId]
  );
  const skills = skillResult.rows.map((row) => ({
    skill: row.skill,
    avg: row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0,
    total: row.total,
    correct: row.correct,
  }));

  const difficultyResult = await pool.query(
    `SELECT aq.difficulty, COUNT(DISTINCT aq.id)::int AS question_count
     FROM assignment_questions aq
     WHERE aq.assignment_id = $1 AND aq.difficulty IS NOT NULL
     GROUP BY aq.difficulty`,
    [assignmentId]
  );
  const difficulty = difficultyResult.rows.map(mapDifficulty);

  const questionResult = await pool.query(
    `SELECT aq.q_order, aq.question_text, aq.skill, aq.difficulty,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE sa.is_correct)::int AS correct
     FROM submission_answers sa
     JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
     JOIN assignment_submissions sub ON sub.id = sa.submission_id
     WHERE sub.assignment_id = $1 AND sub.status IN ('submitted','late_submitted')
     GROUP BY aq.id, aq.q_order, aq.question_text, aq.skill, aq.difficulty
     ORDER BY aq.q_order`,
    [assignmentId]
  );
  const questions = questionResult.rows.map((row) => ({
    q_order: row.q_order,
    question_text: row.question_text,
    skill: row.skill,
    difficulty: row.difficulty,
    total: row.total,
    correct: row.correct,
    wrong: row.total - row.correct,
    correct_rate: row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0,
  }));

  return { skills, difficulty, questions };
}

function createTeacherResultsAnalyticsService({ pool }) {
  async function getResults(assignmentId, teacherId) {
    const ownershipResult = await pool.query(
      `SELECT a.id, a.title, a.class_id, a.skill, c.name AS class_name
       FROM assignments a JOIN classes c ON c.id = a.class_id
       WHERE a.id = $1 AND a.teacher_id = $2`,
      [assignmentId, teacherId]
    );
    if (ownershipResult.rows.length === 0) return { status: "not-found" };

    const submissionResult = await pool.query(
      `SELECT sub.student_id, sub.score, sub.total, sub.percent,
              sub.correct_count, sub.wrong_count, sub.unanswered_count, sub.is_late,
              sub.started_at, sub.submitted_at,
              u.first_name, u.last_name,
              c.name AS class_name
       FROM assignment_submissions sub
       JOIN users u ON u.id = sub.student_id
       JOIN assignments a ON a.id = sub.assignment_id
       JOIN classes c ON c.id = a.class_id
       WHERE sub.assignment_id = $1 AND sub.status IN ('submitted','late_submitted')
       ORDER BY sub.percent DESC`,
      [assignmentId]
    );
    const students = submissionResult.rows.map(mapStudent);
    const assignment = ownershipResult.rows[0];

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS c FROM class_students WHERE class_id = $1 AND status = 'active'`,
      [assignment.class_id]
    );
    const totalStudents = totalResult.rows[0].c;
    const stats = buildStats(students, totalStudents);
    const distribution = buildDistribution(students);
    const classComparison = buildClassComparison(students);
    const answerAnalytics = await loadAnswerAnalytics(pool, assignmentId);

    return {
      status: "found",
      result: {
        assignment: {
          id: assignment.id,
          title: assignment.title,
          class_name: assignment.class_name,
        },
        students,
        stats,
        distribution,
        class_comparison: classComparison,
        skills: answerAnalytics.skills,
        difficulty: answerAnalytics.difficulty,
        questions: answerAnalytics.questions,
      },
    };
  }

  return { getResults };
}

module.exports = { createTeacherResultsAnalyticsService };
