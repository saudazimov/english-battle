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
  const baRes = await pool.query(
    `SELECT skill, is_correct, timed_out
     FROM battle_answers
     WHERE user_id = $1 AND answered_at >= $2 AND answered_at <= $3`,
    [studentId, periodStart, periodEnd]
  );
  const battleAnswers = baRes.rows;

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
  battleAnswers.forEach((a) => {
    const sk = a.skill || "other";
    if (!skillMap[sk]) skillMap[sk] = { correct: 0, total: 0 };
    skillMap[sk].total++;
    if (a.is_correct) skillMap[sk].correct++;
  });
  // Assignment answers'dan ham skill (submission_answers + assignment_questions JOIN)
  const saRes = await pool.query(
    `SELECT aq.skill, sa.is_correct
     FROM submission_answers sa
     JOIN assignment_submissions s ON s.id = sa.submission_id AND s.student_id = $1 AND s.status = 'submitted'
     JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
     WHERE s.submitted_at >= $2 AND s.submitted_at <= $3 AND aq.skill IS NOT NULL AND aq.skill <> ''`,
    [studentId, periodStart, periodEnd]
  );
  saRes.rows.forEach((a) => {
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

  // --- 7. Hisoblangan ko'rsatkichlar ---
  const correctCount = battleAnswers.filter((a) => a.is_correct).length;
  const timeoutCount = battleAnswers.filter((a) => a.timed_out).length;
  const wrongCount = battleAnswers.length - correctCount - timeoutCount;
  const questionsAnswered = battleAnswers.length;
  const accuracy = questionsAnswered > 0 ? Math.round((correctCount / questionsAnswered) * 100) : 0;

  const ratingChange = battles.reduce((s, b) => s + (b.rating_change || 0), 0);
  const xpGained = battles.reduce((s, b) => s + (b.xp_earned || 0), 0);

  // Active days — battle yoki submission bo'lgan noyob kunlar
  const activeDaysSet = new Set();
  battles.forEach((b) => { if (b.played_at) activeDaysSet.add(new Date(b.played_at).toISOString().slice(0, 10)); });
  submissions.forEach((s) => { if (s.submitted_at) activeDaysSet.add(new Date(s.submitted_at).toISOString().slice(0, 10)); });

  const submittedCount = submissions.filter((s) => s.status === "submitted").length;
  const lateCount = submissions.filter((s) => s.is_late).length;
  const subPercents = submissions.filter((s) => s.percent != null).map((s) => s.percent);
  const avgPercent = subPercents.length ? Math.round(subPercents.reduce((a, b) => a + b, 0) / subPercents.length) : null;

  const passedCount = exams.filter((e) => e.passed).length;
  const failedCount = exams.filter((e) => !e.passed).length;

  // --- 8. DATA QUALITY GATE (eng muhim — fake report'ning oldini oladi) ---
  const totalAnswers = questionsAnswered + saRes.rows.length;
  const totalAssignments = submittedCount;
  const totalExams = exams.length;
  // Spetsifikatsiya qoidasi: 30 javob YOKI 2 assignment YOKI 1 exam
  const enoughData = totalAnswers >= 30 || totalAssignments >= 2 || totalExams >= 1;
  let dqConfidence = "low";
  if (totalAnswers >= 80 || totalAssignments >= 5) dqConfidence = "high";
  else if (totalAnswers >= 30 || totalAssignments >= 2) dqConfidence = "medium";

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
      exams_taken: exams.length,
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

module.exports = {
  buildStudentWeeklySnapshot,
  buildTeacherClassSnapshot,
  currentWeekPeriod,
};