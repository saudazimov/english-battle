// aiSnapshot.js — AI uchun REAL data snapshot quruvchi
// ============================================================================
// FALSAFA: AI'ga HECH QACHON raw DB yoki boshqa o'quvchilar ma'lumotini bermaymiz.
// Bu modul faqat real SQL natijalaridan toza, hisoblangan snapshot quradi.
// Barcha foiz/son shu yerda hisoblanadi — AI faqat shularni so'z bilan ifodalaydi.
//
// MAXFIYLIK: snapshotда opponent ism, chat, sinfdosh, telefon — YO'Q.
// DATA QUALITY: yetarli ma'lumot bo'lmasa, enough_data=false qaytadi (AI fake yozmaydi).
// ============================================================================

const pool = require("./db");

// Skill bo'yicha ishonch darajasi (nechta urinish bo'lsa shuncha ishonchli)
function skillConfidence(attempts) {
  if (attempts >= 15) return "high";
  if (attempts >= 6) return "medium";
  return "low";
}

const TOPIC_PATTERNS = [
  ["Articles (a/an/the)", /\b(article|indefinite article|definite article|a\/an\/the)\b/i],
  ["Present Simple", /\b(present simple|do|does|don'?t|doesn'?t)\b/i],
  ["Present Continuous", /\b(present continuous|am\s+\w+ing|is\s+\w+ing|are\s+\w+ing)\b/i],
  ["Past Simple", /\b(past simple|did|didn'?t|yesterday|last (week|year|month))\b/i],
  ["Present Perfect", /\b(present perfect|have been|has been|have\s+\w+ed|has\s+\w+ed)\b/i],
  ["Future forms", /\b(will|going to|future)\b/i],
  ["Modal verbs", /\b(modal verb|modality|can\/could|must\/should)\b/i],
  ["Conditionals", /\b(if clause|conditional|unless)\b/i],
  ["Prepositions", /\b(preposition|prepositional|in\/on\/at|since\/for)\b/i],
  ["Comparatives and superlatives", /\b(comparative|superlative|more than|the most|than)\b/i],
  ["Pronouns", /\b(pronoun|subject pronoun|object pronoun|possessive pronoun)\b/i],
  ["Word order", /\b(word order|correct order|arrange)\b/i],
  ["Subject–verb agreement", /\b(subject.?verb|singular|plural|agrees? with)\b/i],
];

function inferLearningTopic(answer) {
  const source = [answer.question_text, answer.explanation].filter(Boolean).join(" ");
  const matched = TOPIC_PATTERNS.find((entry) => entry[1].test(source));
  if (matched) return matched[0];
  const skill = String(answer.skill || "").trim();
  if (!skill) return "General English";
  return skill.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function selectedAnswerText(answer, optionField) {
  const option = String(answer[optionField] || "").toLowerCase();
  return answer[`option_${option}`] || answer[optionField] || null;
}

function buildLearningDiagnostics(answers) {
  const topics = new Map();
  answers.forEach((answer) => {
    const topic = inferLearningTopic(answer);
    if (!topics.has(topic)) topics.set(topic, { topic, attempts: 0, correct: 0, errors: 0, timeouts: 0, evidence: [] });
    const item = topics.get(topic);
    item.attempts += 1;
    if (answer.is_correct) item.correct += 1;
    else {
      item.errors += 1;
      if (answer.timed_out) item.timeouts += 1;
      if (item.evidence.length < 3 && answer.question_text) {
        item.evidence.push({
          question: answer.question_text,
          selected_answer: selectedAnswerText(answer, "selected_option"),
          correct_answer: selectedAnswerText(answer, "correct_option"),
          explanation: answer.explanation || null,
        });
      }
    }
  });
  const list = Array.from(topics.values()).map((item) => ({
    ...item,
    accuracy: Math.round((item.correct / Math.max(1, item.attempts)) * 100),
    error_rate: Math.round((item.errors / Math.max(1, item.attempts)) * 100),
    confidence: skillConfidence(item.attempts),
  }));
  const priority = list.filter((item) => item.errors > 0)
    .sort((a, b) => b.errors - a.errors || b.error_rate - a.error_rate || b.attempts - a.attempts)
    .slice(0, 6);
  const strongest = list.filter((item) => item.attempts >= 3 && item.accuracy >= 75)
    .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts)
    .slice(0, 5);
  return { topics: list, priority_topics: priority, strongest_topics: strongest };
}

// Bitta o'quvchi uchun haftalik (yoki istalgan davr) snapshot
async function buildStudentWeeklySnapshot(studentId, periodStart, periodEnd) {
  // --- 1. O'quvchi asosiy ma'lumoti ---
  const uRes = await pool.query(
    "SELECT id, first_name, last_name, cefr_level, rating, xp FROM users WHERE id = $1",
    [studentId]
  );
  if (uRes.rows.length === 0) throw new Error("O'quvchi topilmadi");
  const u = uRes.rows[0];

  // League nomi (rating'dan — server.js bilan bir xil chegara)
  function leagueName(r) {
    if (r >= 2000) return "Grandmaster";
    if (r >= 1800) return "Master";
    if (r >= 1600) return "Diamond";
    if (r >= 1400) return "Platinum";
    if (r >= 1200) return "Gold";
    if (r >= 1000) return "Silver";
    return "Bronze";
  }

  // --- 2. Battle answers (davr ichida) — accuracy, correct/wrong/timeout, skill ---
  const answerEventResult = await pool.query(
    `SELECT ae.source_mode, ae.source_record_id, ae.source_question_id,
            ae.legacy_skill AS skill, ae.topic_id,
            ae.question_diagnostic_eligible,
            COALESCE(qa.analysis_confidence,
              CASE WHEN ae.question_diagnostic_eligible THEN 0.70 ELSE 0 END) AS metadata_confidence,
            ae.is_correct, ae.timed_out, ae.selected_option, ae.correct_option,
            ae.answered_at,
            COALESCE(q.question_text, aq.question_text, teq.question_text) AS question_text,
            COALESCE(q.explanation, aq.explanation, teq.explanation) AS explanation,
            COALESCE(q.option_a, aq.option_a, teq.option_a) AS option_a,
            COALESCE(q.option_b, aq.option_b, teq.option_b) AS option_b,
            COALESCE(q.option_c, aq.option_c, teq.option_c) AS option_c,
            COALESCE(q.option_d, aq.option_d, teq.option_d) AS option_d
     FROM student_answer_events ae
     LEFT JOIN questions q ON q.id = ae.question_id
     LEFT JOIN question_ai_analysis qa ON qa.question_id = ae.question_id
     LEFT JOIN assignment_questions aq
       ON ae.source_mode = 'teacher_assignment' AND aq.id = ae.source_question_id
     LEFT JOIN teacher_exam_questions teq
       ON ae.source_mode = 'class_exam' AND teq.id = ae.source_question_id
     WHERE ae.student_id = $1 AND ae.answered_at >= $2 AND ae.answered_at <= $3`,
    [studentId, periodStart, periodEnd]
  );
  const allLearningAnswers = answerEventResult.rows;
  const battleAnswers = allLearningAnswers.filter((answer) => answer.source_mode === "battle");

  // --- 3. Battle history (davr ichida) — battles count, rating change, xp, active days ---
  const bhRes = await pool.query(
    `SELECT outcome, rating_change, xp_earned, played_at, total_questions
     FROM battle_history
     WHERE user_id = $1 AND played_at >= $2 AND played_at <= $3`,
    [studentId, periodStart, periodEnd]
  );
  const battles = bhRes.rows;

  // --- 4. Assignment submissions (davr ichida) ---
  const subRes = await pool.query(
    `SELECT s.status, s.percent, s.is_late, s.submitted_at
     FROM assignment_submissions s
     WHERE s.student_id = $1 AND s.submitted_at >= $2 AND s.submitted_at <= $3`,
    [studentId, periodStart, periodEnd]
  );
  const submissions = subRes.rows;

  // Topshirilmagan (missing) topshiriqlar: shu davrda due bo'lgan, lekin topshirilmagan
  const missingRes = await pool.query(
    `SELECT COUNT(*)::int AS missing
     FROM class_students cs
     JOIN classes c ON c.id = cs.class_id AND c.archived_at IS NULL
     JOIN assignments a ON a.class_id = c.id AND a.status = 'active'
     LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $1 AND s.status = 'submitted'
     WHERE cs.student_id = $1 AND cs.status = 'active'
       AND a.due_at >= $2 AND a.due_at <= $3
       AND s.id IS NULL`,
    [studentId, periodStart, periodEnd]
  );
  const missingCount = missingRes.rows[0].missing;

  // --- 5. Exam attempts (davr ichida) ---
  const exRes = await pool.query(
    `SELECT overall_percent, passed, taken_at
     FROM exam_attempts
     WHERE user_id = $1 AND taken_at >= $2 AND taken_at <= $3
     ORDER BY taken_at DESC`,
    [studentId, periodStart, periodEnd]
  );
  const exams = exRes.rows;

  // --- 6. Skill bo'yicha aniqlik (battle + assignment birlashtirib) ---
  // Battle answers'dan skill statistikasi
  const skillMap = {}; // skill -> { correct, total }
  allLearningAnswers.forEach((a) => {
    const sk = a.skill || "other";
    if (!skillMap[sk]) skillMap[sk] = { correct: 0, total: 0 };
    skillMap[sk].total++;
    if (a.is_correct) skillMap[sk].correct++;
  });

  // Skillarni weak/strong ga ajratamiz (kamida 3 urinish bo'lsa hisobga olamiz)
  const skillList = Object.keys(skillMap)
    .filter((sk) => skillMap[sk].total >= 3)
    .map((sk) => ({
      skill: sk,
      accuracy: Math.round((skillMap[sk].correct / skillMap[sk].total) * 100),
      attempts: skillMap[sk].total,
      confidence: skillConfidence(skillMap[sk].total),
    }));
  const weakSkills = skillList.filter((s) => s.accuracy < 60).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
  const strongSkills = skillList.filter((s) => s.accuracy >= 75).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);
  const learningDiagnostics = buildLearningDiagnostics(allLearningAnswers);
  const profileResult = await pool.query(
    `SELECT p.taxonomy_id, p.taxonomy_level, t.name, t.slug,
            p.exposure_count AS attempts, p.correct_count AS correct,
            p.incorrect_count AS errors, p.timeout_count AS timeouts,
            p.weighted_accuracy AS accuracy, p.error_rate,
            p.mastery_score, p.confidence_score, p.confidence_label AS confidence,
            p.current_evidence_state AS evidence_state,
            p.current_priority AS priority, p.repeated_misconception_count,
            p.dominant_error_classification, p.active_finding_count, p.pattern_summary,
            p.last_attempt
     FROM student_skill_profiles p
     JOIN learning_taxonomy t ON t.id=p.taxonomy_id
     WHERE p.student_id=$1
     ORDER BY p.current_priority DESC, p.taxonomy_level, t.name`,
    [studentId]
  );
  const exactSkillProfiles = profileResult.rows.map((profile) => ({
    ...profile,
    accuracy: Math.round(Number(profile.accuracy || 0)),
    error_rate: Math.round(Number(profile.error_rate || 0)),
    mastery_score: Math.round(Number(profile.mastery_score || 0)),
    confidence_score: Math.round(Number(profile.confidence_score || 0)),
    priority: Math.round(Number(profile.priority || 0)),
  }));
  const findingResult = await pool.query(
    `SELECT f.id,f.taxonomy_id,t.name AS skill_name,t.node_type AS taxonomy_level,
            f.finding_code,f.finding_type,f.error_classification,f.severity,
            f.confidence,f.evidence_state,f.occurrence_count,f.evidence,
            f.recommended_action,f.first_detected_at,f.last_detected_at
     FROM learning_findings f
     JOIN learning_taxonomy t ON t.id=f.taxonomy_id
     WHERE f.student_id=$1 AND f.is_active=true
     ORDER BY CASE f.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
              CASE t.node_type WHEN 'micro_skill' THEN 4 WHEN 'subskill' THEN 3 WHEN 'topic' THEN 2 ELSE 1 END DESC,
              f.confidence DESC,f.occurrence_count DESC
     LIMIT 20`,
    [studentId]
  );
  const patternFindings = findingResult.rows.map((finding) => ({
    ...finding,
    confidence: Math.round(Number(finding.confidence || 0) * 100),
  }));
  const remediationTargets = [];
  const remediationCodes = new Set();
  for (const finding of patternFindings) {
    if (!["CONFIRMED", "LIKELY", "REGRESSED"].includes(finding.evidence_state)) continue;
    if (remediationCodes.has(finding.finding_code)) continue;
    remediationCodes.add(finding.finding_code);
    remediationTargets.push(finding);
    if (remediationTargets.length === 3) break;
  }

  // --- 7. Hisoblangan ko'rsatkichlar ---
  const correctCount = allLearningAnswers.filter((a) => a.is_correct).length;
  const timeoutCount = allLearningAnswers.filter((a) => a.timed_out).length;
  const wrongCount = allLearningAnswers.length - correctCount - timeoutCount;
  const questionsAnswered = allLearningAnswers.length;
  const accuracy = allLearningAnswers.length > 0 ? Math.round((correctCount / allLearningAnswers.length) * 100) : 0;

  const ratingChange = battles.reduce((s, b) => s + (b.rating_change || 0), 0);
  const xpGained = battles.reduce((s, b) => s + (b.xp_earned || 0), 0);

  // Active days — battle yoki submission bo'lgan noyob kunlar
  const activeDaysSet = new Set();
  battles.forEach((b) => { if (b.played_at) activeDaysSet.add(new Date(b.played_at).toISOString().slice(0, 10)); });
  submissions.forEach((s) => { if (s.submitted_at) activeDaysSet.add(new Date(s.submitted_at).toISOString().slice(0, 10)); });
  allLearningAnswers.forEach((answer) => {
    if (answer.answered_at) activeDaysSet.add(new Date(answer.answered_at).toISOString().slice(0, 10));
  });

  const submittedCount = submissions.filter((s) => s.status === "submitted").length;
  const lateCount = submissions.filter((s) => s.is_late).length;
  const subPercents = submissions.filter((s) => s.percent != null).map((s) => s.percent);
  const avgPercent = subPercents.length ? Math.round(subPercents.reduce((a, b) => a + b, 0) / subPercents.length) : null;

  const passedCount = exams.filter((e) => e.passed).length;
  const failedCount = exams.filter((e) => !e.passed).length;

  // --- 8. DATA QUALITY GATE (eng muhim — fake report'ning oldini oladi) ---
  const totalAnswers = allLearningAnswers.length;
  const totalAssignments = submittedCount;
  const classExamCount = new Set(
    allLearningAnswers
      .filter((answer) => answer.source_mode === "class_exam")
      .map((answer) => answer.source_record_id)
  ).size;
  const totalExams = exams.length + classExamCount;
  const gateResult = await pool.query(
    `SELECT setting_value FROM system_learning_settings
     WHERE setting_key='student_report_quality_gate_v1'`
  );
  const gate = gateResult.rows[0] && gateResult.rows[0].setting_value
    ? gateResult.rows[0].setting_value
    : {};
  const thresholds = {
    answer_threshold: Number(gate.answer_threshold || 30),
    assignment_threshold: Number(gate.assignment_threshold || 2),
    exam_threshold: Number(gate.exam_threshold || 1),
    reliable_question_threshold: Number(gate.reliable_question_threshold || 10),
    session_threshold: Number(gate.session_threshold || 2),
    topic_threshold: Number(gate.topic_threshold || 2),
    metadata_confidence_threshold: Number(gate.metadata_confidence_threshold || 0.55),
  };
  const reliableQuestionCount = new Set(
    allLearningAnswers
      .filter((answer) => answer.question_diagnostic_eligible)
      .map((answer) => `${answer.source_mode}:${answer.source_question_id}`)
  ).size;
  const sessionCount = new Set(
    allLearningAnswers.map((answer) => `${answer.source_mode}:${answer.source_record_id}`)
  ).size;
  const coveredTopicCount = new Set(
    allLearningAnswers
      .map((answer) => answer.topic_id || answer.skill)
      .filter(Boolean)
  ).size;
  const metadataValues = allLearningAnswers
    .filter((answer) => answer.question_diagnostic_eligible)
    .map((answer) => Number(answer.metadata_confidence || 0));
  const metadataConfidence = metadataValues.length
    ? metadataValues.reduce((sum, value) => sum + value, 0) / metadataValues.length
    : 0;
  const primaryGateMet = totalAnswers >= thresholds.answer_threshold
    || totalAssignments >= thresholds.assignment_threshold
    || totalExams >= thresholds.exam_threshold;
  const evidenceBreadthMet = reliableQuestionCount >= thresholds.reliable_question_threshold
    && sessionCount >= thresholds.session_threshold
    && coveredTopicCount >= thresholds.topic_threshold
    && metadataConfidence >= thresholds.metadata_confidence_threshold;
  // Assignment yoki imtihon yakunlanishi mavjud kuchli gate sifatida saqlanadi.
  // Faqat answer-count yo'li esa diagnostik sifat va qamrovni ham talab qiladi.
  const enoughData = primaryGateMet && (
    evidenceBreadthMet
    || totalAssignments >= thresholds.assignment_threshold
    || totalExams >= thresholds.exam_threshold
  );
  let dqConfidence = "low";
  if (enoughData && (totalAnswers >= 80 || totalAssignments >= 5)
      && metadataConfidence >= 0.75 && sessionCount >= 4) dqConfidence = "high";
  else if (enoughData) dqConfidence = "medium";

  return {
    student: {
      id: u.id,
      name: ((u.first_name || "") + " " + (u.last_name || "")).trim() || "O'quvchi",
      cefr_level: u.cefr_level || "A1",
      league: leagueName(u.rating || 0),
      rating: u.rating || 0,
      xp: u.xp || 0,
    },
    period: { start: periodStart, end: periodEnd },
    activity: {
      battles_count: battles.length,
      questions_answered: questionsAnswered,
      assignments_completed: submittedCount,
      exams_taken: totalExams,
      active_days: activeDaysSet.size,
    },
    performance: {
      accuracy: accuracy,
      correct_count: correctCount,
      wrong_count: wrongCount,
      timeout_count: timeoutCount,
      rating_change: ratingChange,
      xp_gained: xpGained,
    },
    weak_skills: weakSkills,
    strong_skills: strongSkills,
    learning_diagnostics: {
      ...learningDiagnostics,
      skill_profiles: exactSkillProfiles,
      priority_skill_profiles: exactSkillProfiles.filter((item) => item.errors > 0).slice(0, 6),
      pattern_findings: patternFindings,
      remediation_targets: remediationTargets,
      analyzed_answers: totalAnswers,
      sources: {
        battle_answers: battleAnswers.length,
        assignment_answers: allLearningAnswers.filter((answer) => answer.source_mode === "teacher_assignment").length,
        practice_answers: allLearningAnswers.filter((answer) => answer.source_mode === "practice").length,
        level_exam_answers: allLearningAnswers.filter((answer) => answer.source_mode === "level_exam").length,
        class_exam_answers: allLearningAnswers.filter((answer) => answer.source_mode === "class_exam").length,
      },
      coverage_note: "Battle, assignment, practice, level-exam and class-exam answers use the unified diagnostic event stream.",
    },
    assignments: {
      total: submissions.length + missingCount,
      submitted: submittedCount,
      late: lateCount,
      missing: missingCount,
      average_percent: avgPercent,
    },
    exams: {
      latest_score: exams.length ? exams[0].overall_percent : null,
      passed_count: passedCount,
      failed_count: failedCount,
      next_level_eligible: null, // exam/status alohida hisoblaydi — bu yerda kiritmaymiz
    },
    data_quality: {
      enough_data: enoughData,
      total_answers: totalAnswers,
      total_assignments: totalAssignments,
      total_exams: totalExams,
      report_level: enoughData ? "full" : "preliminary",
      primary_gate_met: primaryGateMet,
      evidence_breadth_met: evidenceBreadthMet,
      reliable_question_count: reliableQuestionCount,
      session_count: sessionCount,
      covered_topic_count: coveredTopicCount,
      metadata_confidence: Math.round(metadataConfidence * 100) / 100,
      thresholds,
      confidence: dqConfidence,
    },
  };
}

// ============================================================================
// TEACHER CLASS SNAPSHOT — sinf darajasidagi real agregat (faqat o'z sinfi)
// ============================================================================
async function buildTeacherClassSnapshot(teacherId, classId, periodStart, periodEnd) {
  // --- 1. Sinf egaligi tekshiruvi + asosiy ma'lumot ---
  const clsRes = await pool.query(
    "SELECT id, name, teacher_id FROM classes WHERE id = $1 AND archived_at IS NULL",
    [classId]
  );
  if (clsRes.rows.length === 0) throw new Error("Sinf topilmadi");
  const cls = clsRes.rows[0];
  if (cls.teacher_id !== teacherId) throw new Error("Bu sinf sizga tegishli emas");

  // --- 2. O'quvchilar soni ---
  const studRes = await pool.query(
    "SELECT student_id FROM class_students WHERE class_id = $1 AND status = 'active'",
    [classId]
  );
  const studentIds = studRes.rows.map((r) => r.student_id);
  const totalStudents = studentIds.length;

  // --- 3. Davr ichidagi topshiriqlar ---
  const asgRes = await pool.query(
    `SELECT id, title, due_at FROM assignments
     WHERE class_id = $1 AND status = 'active'
       AND created_at >= $2 AND created_at <= $3`,
    [classId, periodStart, periodEnd]
  );
  const assignments = asgRes.rows;
  const assignmentIds = assignments.map((a) => a.id);

  // --- 4. Topshiriq natijalari (completion + percent + late) ---
  let submitted = 0, late = 0, missing = 0;
  let percentSum = 0, percentCount = 0;
  let highest = null, lowest = null;
  const studentStats = {}; // student_id -> { name, submitted, percentSum, percentCount, missing }

  if (assignmentIds.length > 0 && totalStudents > 0) {
    const subRes = await pool.query(
      `SELECT s.student_id, s.status, s.percent, s.is_late,
              (u.first_name || ' ' || COALESCE(u.last_name,'')) AS name
       FROM assignment_submissions s
       JOIN users u ON u.id = s.student_id
       WHERE s.assignment_id = ANY($1) AND s.status IN ('submitted','late_submitted')`,
      [assignmentIds]
    );
    subRes.rows.forEach((r) => {
      submitted++;
      if (r.is_late) late++;
      if (r.percent != null) { percentSum += r.percent; percentCount++; }
      if (!studentStats[r.student_id]) studentStats[r.student_id] = { name: r.name.trim(), submitted: 0, percentSum: 0, percentCount: 0 };
      const st = studentStats[r.student_id];
      st.submitted++;
      if (r.percent != null) { st.percentSum += r.percent; st.percentCount++; }
    });

    // Missing: kutilgan (student × assignment) - topshirilgan
    const expected = totalStudents * assignmentIds.length;
    missing = Math.max(0, expected - submitted);

    // Eng yuqori/past o'quvchi (o'rtacha foiz bo'yicha)
    Object.keys(studentStats).forEach((sid) => {
      const st = studentStats[sid];
      const avg = st.percentCount ? Math.round(st.percentSum / st.percentCount) : null;
      if (avg != null) {
        if (!highest || avg > highest.percent) highest = { name: st.name, percent: avg };
        if (!lowest || avg < lowest.percent) lowest = { name: st.name, percent: avg };
      }
    });
  }
  const avgCompletion = totalStudents && assignmentIds.length
    ? Math.round((submitted / (totalStudents * assignmentIds.length)) * 100)
    : 0;
  const classAverage = percentCount ? Math.round(percentSum / percentCount) : null;

  // --- 5. Sinf darajasida skill aniqligi (submission_answers + assignment_questions) ---
  let skillRows = [];
  if (assignmentIds.length > 0) {
    const skRes = await pool.query(
      `SELECT aq.skill, sa.is_correct
       FROM submission_answers sa
       JOIN assignment_submissions s ON s.id = sa.submission_id AND s.status IN ('submitted','late_submitted')
       JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
       WHERE aq.assignment_id = ANY($1) AND aq.skill IS NOT NULL AND aq.skill <> ''`,
      [assignmentIds]
    );
    skillRows = skRes.rows;
  }
  const classSkillMap = {};
  skillRows.forEach((a) => {
    const sk = a.skill || "other";
    if (!classSkillMap[sk]) classSkillMap[sk] = { correct: 0, total: 0 };
    classSkillMap[sk].total++;
    if (a.is_correct) classSkillMap[sk].correct++;
  });
  const weakSkills = Object.keys(classSkillMap)
    .filter((sk) => classSkillMap[sk].total >= 5)
    .map((sk) => ({
      skill: sk,
      class_accuracy: Math.round((classSkillMap[sk].correct / classSkillMap[sk].total) * 100),
      attempts: classSkillMap[sk].total,
    }))
    .filter((s) => s.class_accuracy < 65)
    .sort((a, b) => a.class_accuracy - b.class_accuracy)
    .slice(0, 5);

  // --- 6. Eng ko'p xato qilingan savollar ---
  let mostMissed = [];
  if (assignmentIds.length > 0) {
    const mmRes = await pool.query(
      `SELECT aq.question_text, aq.skill,
              COUNT(*) FILTER (WHERE sa.is_correct = false)::int AS wrong_count,
              COUNT(*)::int AS total_attempts
       FROM submission_answers sa
       JOIN assignment_submissions s ON s.id = sa.submission_id AND s.status IN ('submitted','late_submitted')
       JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
       WHERE aq.assignment_id = ANY($1)
       GROUP BY aq.id, aq.question_text, aq.skill
       HAVING COUNT(*) >= 3 AND COUNT(*) FILTER (WHERE sa.is_correct = false) > 0
       ORDER BY (COUNT(*) FILTER (WHERE sa.is_correct = false))::float / COUNT(*) DESC
       LIMIT 5`,
      [assignmentIds]
    );
    mostMissed = mmRes.rows.map((r) => ({
      question_text: (r.question_text || "").slice(0, 120),
      skill: r.skill || "other",
      wrong_count: r.wrong_count,
      total_attempts: r.total_attempts,
    }));
  }

  // --- 7. E'tibor kerak bo'lgan o'quvchilar (kam topshirgan / past natija) ---
  const needAttention = [];
  Object.keys(studentStats).forEach((sid) => {
    const st = studentStats[sid];
    const avg = st.percentCount ? Math.round(st.percentSum / st.percentCount) : null;
    const studentMissing = assignmentIds.length - st.submitted;
    const reasons = [];
    if (studentMissing > 0) reasons.push(`${studentMissing} ta topshiriq bajarilmagan`);
    if (avg != null && avg < 50) reasons.push(`o'rtacha natija ${avg}%`);
    if (reasons.length > 0) {
      needAttention.push({
        student_id: parseInt(sid),
        name: st.name,
        reason: reasons.join(", "),
        accuracy: avg,
        missing_assignments: studentMissing,
      });
    }
  });
  // Umuman topshirmaganlarni ham qo'shamiz
  studentIds.forEach((sid) => {
    if (!studentStats[sid] && assignmentIds.length > 0) {
      needAttention.push({
        student_id: sid,
        name: null,
        reason: `${assignmentIds.length} ta topshiriqning hech birini bajarmagan`,
        accuracy: null,
        missing_assignments: assignmentIds.length,
      });
    }
  });

  // --- 8. DATA QUALITY GATE ---
  const totalSubmissionAnswers = skillRows.length;
  const enoughData = submitted >= 5 || totalSubmissionAnswers >= 30;
  let dqConfidence = "low";
  if (submitted >= 20 || totalSubmissionAnswers >= 100) dqConfidence = "high";
  else if (submitted >= 5 || totalSubmissionAnswers >= 30) dqConfidence = "medium";

  return {
    class: { id: cls.id, name: cls.name, total_students: totalStudents },
    period: { start: periodStart, end: periodEnd },
    completion: {
      assignments_given: assignments.length,
      average_completion: avgCompletion,
      late_submissions: late,
      missing_submissions: missing,
    },
    performance: {
      class_average: classAverage,
      highest_student: highest,
      lowest_student: lowest,
    },
    weak_skills: weakSkills,
    most_missed_questions: mostMissed,
    students_need_attention: needAttention.slice(0, 8),
    data_quality: {
      enough_data: enoughData,
      total_submissions: submitted,
      total_answers: totalSubmissionAnswers,
      confidence: dqConfidence,
    },
  };
}

// Hafta chegaralari (dushanba 00:00 dan yakshanba 23:59 gacha) — joriy hafta
function currentWeekPeriod() {
  const now = new Date();
  const day = now.getDay(); // 0=yakshanba, 1=dushanba
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function recentPeriod(days) {
  const safeDays = Math.max(1, Math.min(90, Number(days) || 7));
  const end = new Date();
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - safeDays + 1);
  return { start, end };
}

module.exports = {
  buildLearningDiagnostics,
  buildStudentWeeklySnapshot,
  buildTeacherClassSnapshot,
  currentWeekPeriod,
  recentPeriod,
};
