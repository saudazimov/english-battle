const { mapReviewQuestion } = require("./studentAssignmentReviewService");
const { createAnswerEventService } = require("./answerEventService");

function createAnswerMap(answers) {
  const valid = new Set(["A", "B", "C", "D"]);
  const answerMap = {};
  for (const answer of answers) {
    const questionId = parseInt(answer.assignment_question_id, 10);
    let selected = (answer.answer || "").toString().toUpperCase();
    if (!valid.has(selected)) selected = null;
    if (!isNaN(questionId)) answerMap[questionId] = selected;
  }
  return answerMap;
}

function gradeQuestions(questions, answerMap) {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  const rows = [];
  for (const question of questions) {
    const selected = Object.prototype.hasOwnProperty.call(answerMap, question.id)
      ? answerMap[question.id]
      : null;
    const isCorrect = selected !== null && selected === question.correct_answer;
    if (selected === null) unanswered++;
    else if (isCorrect) correct++;
    else wrong++;
    rows.push({
      aqId: question.id,
      sel: selected,
      correct_answer: question.correct_answer,
      isCorrect,
    });
  }
  return { correct, wrong, unanswered, rows };
}

function createStudentAssignmentSubmitService({ pool, answerEventService }) {
  const diagnosticEvents = answerEventService || createAnswerEventService({ pool });
  async function submitAssignment({ assignmentId, studentId, answers }) {
    const assignmentResult = await pool.query(
      `SELECT a.id, a.due_at, a.question_count
       FROM assignments a
       JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = $2 AND cs.status='active'
       JOIN classes c ON c.id = a.class_id AND c.archived_at IS NULL
       WHERE a.id = $1 AND a.status = 'active'`,
      [assignmentId, studentId]
    );
    if (assignmentResult.rows.length === 0) return { status: "assignment-not-found" };
    const assignment = assignmentResult.rows[0];

    const submissionResult = await pool.query(
      "SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 ORDER BY attempt_number DESC LIMIT 1",
      [assignmentId, studentId]
    );
    let submission = submissionResult.rows[0] || null;
    if (submission && submission.status === "submitted") {
      return { status: "already-submitted" };
    }

    const questionResult = await pool.query(
      `SELECT id, q_order, correct_answer, original_question_id, cefr_level, skill
       FROM assignment_questions WHERE assignment_id=$1 ORDER BY q_order`,
      [assignmentId]
    );
    const answerMap = createAnswerMap(answers);
    const grade = gradeQuestions(questionResult.rows, answerMap);
    const questionMetadata = new Map(
      questionResult.rows.map((question) => [Number(question.id), question])
    );
    const total = questionResult.rows.length;
    const percent = total > 0 ? Math.round((grade.correct / total) * 100) : 0;
    const isLate = !!(assignment.due_at && new Date() > new Date(assignment.due_at));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (!submission) {
        const insertResult = await client.query(
          `INSERT INTO assignment_submissions (assignment_id, student_id, total, status)
           VALUES ($1, $2, $3, 'in_progress') RETURNING *`,
          [assignmentId, studentId, total]
        );
        submission = insertResult.rows[0];
      }

      await client.query("DELETE FROM submission_answers WHERE submission_id=$1", [submission.id]);
      for (const row of grade.rows) {
        await client.query(
          `INSERT INTO submission_answers (submission_id, assignment_question_id, selected_option, correct_answer, is_correct)
           VALUES ($1, $2, $3, $4, $5)`,
          [submission.id, row.aqId, row.sel, row.correct_answer, row.isCorrect]
        );
      }

      const updateResult = await client.query(
        `UPDATE assignment_submissions
         SET score=$1, total=$2, percent=$3, correct_count=$4, wrong_count=$5, unanswered_count=$6,
             is_late=$7, status='submitted', submitted_at=NOW()
         WHERE id=$8
         RETURNING score, total, percent, correct_count, wrong_count, unanswered_count, is_late, submitted_at`,
        [grade.correct, total, percent, grade.correct, grade.wrong, grade.unanswered, isLate, submission.id]
      );
      await client.query("COMMIT");

      await diagnosticEvents.recordManySafe(grade.rows.map((row) => {
        const metadata = questionMetadata.get(Number(row.aqId)) || {};
        return {
          studentId,
          questionId: metadata.original_question_id,
          sourceMode: "teacher_assignment",
          sourceRecordId: String(submission.id),
          sourceQuestionId: row.aqId,
          selectedOption: row.sel,
          correctOption: row.correct_answer,
          isCorrect: row.isCorrect,
          attemptNumber: submission.attempt_number || 1,
          detectedCefrLevel: metadata.cefr_level,
          legacySkill: metadata.skill,
          answeredAt: updateResult.rows[0].submitted_at,
        };
      }));

      const reviewResult = await pool.query(
        `SELECT aq.q_order, aq.question_text, aq.option_a, aq.option_b, aq.option_c, aq.option_d, aq.explanation,
                sa.selected_option, sa.correct_answer, sa.is_correct
         FROM submission_answers sa
         JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
         WHERE sa.submission_id = $1 ORDER BY aq.q_order`,
        [submission.id]
      );
      return {
        status: "submitted",
        result: updateResult.rows[0],
        review: reviewResult.rows.map(mapReviewQuestion),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { submitAssignment };
}

module.exports = {
  createStudentAssignmentSubmitService,
  createAnswerMap,
  gradeQuestions,
};
