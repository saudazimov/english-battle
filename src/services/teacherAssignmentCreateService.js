function createTeacherAssignmentCreateService({ pool, premium, logAudit }) {
  async function createAssignment({
    req, teacherId, classId, title, description, cefrLevel,
    skill, questionCount, dueAt, maxAttempts,
  }) {
    const classResult = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
      [classId, teacherId]
    );
    if (classResult.rows.length === 0) return { type: "class_not_found" };

    const assignmentLimit = await premium.checkTeacherLimit(teacherId, "assignments");
    if (!assignmentLimit.allowed) {
      await logAudit(req, "teacher_limit_blocked_assignment", {
        entityType: "assignment",
        entityId: classId,
        details: "teacher=" + teacherId + " count=" + assignmentLimit.current + " limit=" + assignmentLimit.limit + " plan=free",
      }).catch(() => {});
      return { type: "limit_reached", error: premium.teacherLimitError("assignments") };
    }

    let questionSql = "SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, cefr_level, skill, difficulty FROM questions WHERE status = 'published' AND cefr_level = $1";
    const questionParams = [cefrLevel];
    if (skill !== "mixed") {
      questionParams.push(skill);
      questionSql += " AND skill = $2";
    }
    questionSql += " ORDER BY RANDOM() LIMIT " + questionCount;
    const questionResult = await pool.query(questionSql, questionParams);
    if (questionResult.rows.length < questionCount) {
      return { type: "questions_unavailable", available: questionResult.rows.length };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const assignmentResult = await client.query(
        `INSERT INTO assignments (class_id, teacher_id, title, description, cefr_level, skill, question_count, due_at, max_attempts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, title, description, cefr_level, skill, question_count, due_at, max_attempts, status, created_at`,
        [classId, teacherId, title, (description || "").trim() || null, cefrLevel, skill, questionCount, dueAt, maxAttempts]
      );
      const assignment = assignmentResult.rows[0];

      for (let index = 0; index < questionResult.rows.length; index++) {
        const question = questionResult.rows[index];
        await client.query(
          `INSERT INTO assignment_questions
           (assignment_id, original_question_id, q_order, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, cefr_level, skill, difficulty)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [assignment.id, question.id, index + 1, question.question_text, question.option_a, question.option_b, question.option_c, question.option_d, question.correct_option, question.explanation, question.cefr_level, question.skill, question.difficulty]
        );
      }

      await client.query("COMMIT");
      return { type: "created", assignment };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { createAssignment };
}

module.exports = { createTeacherAssignmentCreateService };
