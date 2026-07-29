function createTeacherExamCreateService({ pool, logAudit }) {
  async function createExam({
    req, teacherId, classId, title, description, cefrLevel, skill,
    questionCount, durationMinutes, passPercent, maxAttempts, startsAt, endsAt,
  }) {
    if (classId) {
      const classResult = await pool.query(
        "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
        [classId, teacherId]
      );
      if (classResult.rows.length === 0) return { type: "class_not_found" };
    }

    let questionSql = "SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, cefr_level, skill, difficulty FROM questions WHERE status = 'published' AND cefr_level = $1";
    const questionParams = [cefrLevel];
    if (skill !== "mixed") {
      questionParams.push(skill);
      questionSql += " AND skill = $2";
    }
    questionSql += " ORDER BY RANDOM() LIMIT " + questionCount;

    const questionResult = await pool.query(questionSql, questionParams);
    if (questionResult.rows.length < 1) return { type: "questions_unavailable" };

    const examResult = await pool.query(
      `INSERT INTO teacher_exams
        (teacher_id, class_id, title, description, cefr_level, skill, question_count,
         duration_minutes, pass_percent, max_attempts, starts_at, ends_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [teacherId, classId, title, (description || "").trim(), cefrLevel, skill,
        questionResult.rows.length, durationMinutes, passPercent, maxAttempts, startsAt, endsAt,
        startsAt && startsAt > new Date() ? "scheduled" : "active"]
    );
    const examId = examResult.rows[0].id;

    for (let index = 0; index < questionResult.rows.length; index++) {
      const question = questionResult.rows[index];
      await pool.query(
        `INSERT INTO teacher_exam_questions
          (exam_id, original_question_id, q_order, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, skill, cefr_level, difficulty)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [examId, question.id, index + 1, question.question_text, question.option_a,
          question.option_b, question.option_c, question.option_d, question.correct_option,
          question.explanation, question.skill, question.cefr_level, question.difficulty]
      );
    }

    if (typeof logAudit === "function") {
      logAudit(req, "exam_created", { entityType: "exam", entityId: examId });
    }

    return { type: "created", examId, questionCount: questionResult.rows.length };
  }

  return { createExam };
}

module.exports = { createTeacherExamCreateService };
