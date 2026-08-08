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

const WEAK_STATES = new Set(["SUSPECTED", "LIKELY", "CONFIRMED", "REMEDIATING", "REGRESSED"]);

function numberOrZero(value) {
  return Number(value || 0);
}

function studentName(row) {
  return `${row.first_name || ""} ${row.last_name || ""}`.trim() || "O'quvchi";
}

function buildClassLearningAnalytics(profileRows, lessonRows, findingRows, totalStudents) {
  const students = new Map();
  const topics = new Map();
  let totalCorrect = 0;
  let totalExposure = 0;

  for (const row of profileRows) {
    if (!students.has(row.student_id)) {
      students.set(row.student_id, {
        student_id: row.student_id,
        name: studentName(row),
        profiles: [],
        findings: [],
        lesson: null,
      });
    }
    if (!row.taxonomy_id) continue;
    const profile = {
      taxonomy_id: row.taxonomy_id,
      taxonomy_name: row.taxonomy_name,
      taxonomy_level: row.taxonomy_level,
      mastery: numberOrZero(row.mastery_score),
      confidence: numberOrZero(row.confidence_score),
      accuracy: numberOrZero(row.weighted_accuracy),
      exposure_count: numberOrZero(row.exposure_count),
      incorrect_count: numberOrZero(row.incorrect_count),
      repeated_misconceptions: numberOrZero(row.repeated_misconception_count),
      state: row.current_evidence_state || "OBSERVED",
      priority: numberOrZero(row.current_priority),
      retention: numberOrZero(row.retention_score),
      dominant_error: row.dominant_error_classification || null,
      next_review_date: row.next_review_date || null,
    };
    students.get(row.student_id).profiles.push(profile);
    totalCorrect += numberOrZero(row.correct_count);
    totalExposure += numberOrZero(row.exposure_count);
    const topic = topics.get(String(row.taxonomy_id)) || {
      taxonomy_id: row.taxonomy_id,
      name: row.taxonomy_name,
      level: row.taxonomy_level,
      observed_students: 0,
      weak_students: 0,
      mastery_sum: 0,
      repeated_misconceptions: 0,
    };
    topic.observed_students += 1;
    topic.mastery_sum += profile.mastery;
    topic.repeated_misconceptions += profile.repeated_misconceptions;
    if (WEAK_STATES.has(profile.state)) topic.weak_students += 1;
    topics.set(String(row.taxonomy_id), topic);
  }

  for (const row of lessonRows) {
    const student = students.get(row.student_id);
    if (student) student.lesson = {
      active: numberOrZero(row.active_lessons),
      completed: numberOrZero(row.completed_lessons),
      progress: numberOrZero(row.avg_progress),
      retest_pending: numberOrZero(row.retest_pending),
    };
  }
  for (const row of findingRows) {
    const student = students.get(row.student_id);
    if (student) student.findings.push({
      taxonomy_id: row.taxonomy_id,
      taxonomy_name: row.taxonomy_name,
      type: row.finding_type,
      classification: row.error_classification,
      severity: row.severity,
      confidence: Math.round(numberOrZero(row.confidence) * 100),
      occurrences: numberOrZero(row.occurrence_count),
      evidence: row.evidence || {},
      recommended_action: row.recommended_action,
    });
  }

  const topicList = Array.from(topics.values()).map((topic) => ({
    ...topic,
    average_mastery: topic.observed_students
      ? Math.round(topic.mastery_sum / topic.observed_students)
      : 0,
  })).sort((a, b) => b.weak_students - a.weak_students || a.average_mastery - b.average_mastery);
  const studentList = Array.from(students.values()).map((student) => {
    const weak = student.profiles.filter((profile) => WEAK_STATES.has(profile.state));
    const strongest = student.profiles.slice().sort((a, b) => b.mastery - a.mastery)[0] || null;
    return {
      ...student,
      needs_support: weak.length > 0,
      improving: student.profiles.some((profile) => profile.state === "IMPROVING"),
      regressed: student.profiles.some((profile) => profile.state === "REGRESSED"),
      overdue_reviews: student.profiles.filter((profile) => profile.next_review_date
        && new Date(profile.next_review_date) < new Date()).length,
      highest_priority_weakness: weak.slice().sort((a, b) => b.priority - a.priority)[0] || null,
      strongest_skill: strongest,
    };
  });
  const heatmapTopics = topicList.slice(0, 8);
  const groupRecommendations = topicList.filter((topic) => topic.weak_students >= 2).slice(0, 5).map((topic) => ({
    taxonomy_id: topic.taxonomy_id,
    topic: topic.name,
    affected_students: topic.weak_students,
    total_students: totalStudents,
    repeated_misconceptions: topic.repeated_misconceptions,
    recommendation: `${topic.name} bo'yicha guruh darsi va keyingi qisqa retest tavsiya etiladi.`,
  }));

  return {
    overview: {
      class_accuracy: totalExposure ? Math.round(totalCorrect / totalExposure * 100) : null,
      class_mastery: topicList.length
        ? Math.round(topicList.reduce((sum, topic) => sum + topic.average_mastery, 0) / topicList.length)
        : null,
      students_with_evidence: studentList.filter((student) => student.profiles.length).length,
      students_needing_support: studentList.filter((student) => student.needs_support).length,
      students_improving: studentList.filter((student) => student.improving).length,
      students_regressed: studentList.filter((student) => student.regressed).length,
      overdue_reviews: studentList.reduce((sum, student) => sum + student.overdue_reviews, 0),
    },
    weak_topics: topicList.filter((topic) => topic.weak_students > 0).slice(0, 8),
    heatmap: { topics: heatmapTopics, students: studentList },
    students: studentList,
    group_recommendations: groupRecommendations,
  };
}

async function loadClassLearningAnalytics(pool, classId, totalStudents) {
  const [profiles, lessons, findings] = await Promise.all([
    pool.query(
      `SELECT cs.student_id,u.first_name,u.last_name,p.taxonomy_id,t.name AS taxonomy_name,
              p.taxonomy_level,p.mastery_score,p.confidence_score,p.weighted_accuracy,
              p.exposure_count,p.correct_count,p.incorrect_count,p.repeated_misconception_count,
              p.current_evidence_state,p.current_priority,p.retention_score,
              p.dominant_error_classification,p.next_review_date
       FROM class_students cs JOIN users u ON u.id=cs.student_id
       LEFT JOIN student_skill_profiles p ON p.student_id=cs.student_id
       LEFT JOIN learning_taxonomy t ON t.id=p.taxonomy_id
       WHERE cs.class_id=$1 AND cs.status='active'
       ORDER BY u.first_name,u.last_name,p.current_priority DESC NULLS LAST`,
      [classId]
    ),
    pool.query(
      `SELECT cs.student_id,
              COUNT(pl.id) FILTER (WHERE pl.status IN ('READY','ASSIGNED','STARTED'))::int AS active_lessons,
              COUNT(pl.id) FILTER (WHERE pl.status='COMPLETED')::int AS completed_lessons,
              COALESCE(AVG(pl.progress_percent),0)::float AS avg_progress,
              COUNT(rp.id) FILTER (WHERE rp.status IN ('RETEST_PENDING','RETEST_FAILED'))::int AS retest_pending
       FROM class_students cs
       LEFT JOIN remediation_plans rp ON rp.student_id=cs.student_id
       LEFT JOIN personalized_lessons pl ON pl.remediation_plan_id=rp.id
       WHERE cs.class_id=$1 AND cs.status='active' GROUP BY cs.student_id`,
      [classId]
    ),
    pool.query(
      `SELECT f.student_id,f.taxonomy_id,t.name AS taxonomy_name,f.finding_type,
              f.error_classification,f.severity,f.confidence,f.occurrence_count,
              f.evidence,f.recommended_action
       FROM learning_findings f
       JOIN class_students cs ON cs.student_id=f.student_id AND cs.class_id=$1 AND cs.status='active'
       JOIN learning_taxonomy t ON t.id=f.taxonomy_id
       WHERE f.is_active=true ORDER BY f.severity DESC,f.confidence DESC`,
      [classId]
    ),
  ]);
  return buildClassLearningAnalytics(profiles.rows, lessons.rows, findings.rows, totalStudents);
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
    const teacherAnalytics = await loadClassLearningAnalytics(pool, assignment.class_id, totalStudents);

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
        teacher_analytics: teacherAnalytics,
      },
    };
  }

  return { getResults };
}

module.exports = { createTeacherResultsAnalyticsService };
