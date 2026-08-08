const { createAnswerEventService } = require("./answerEventService");

function createStudentExamAttemptAnswerService({ pool, answerEventService }) {
  const diagnosticEvents = answerEventService || createAnswerEventService({ pool });

  async function saveAnswer({ attemptId, studentId, questionId, answer, responseTimeMs }) {
    const attemptResult = await pool.query(
      "SELECT * FROM teacher_exam_attempts WHERE id = $1 AND student_id = $2",
      [attemptId, studentId]
    );
    if (attemptResult.rows.length === 0) return "attempt-not-found";

    const attempt = attemptResult.rows[0];
    if (attempt.status !== "in_progress") return "exam-finished";
    if (attempt.expires_at && new Date(attempt.expires_at) < new Date()) return "expired";

    const questionResult = await pool.query(
      `SELECT id, original_question_id, correct_answer, skill, cefr_level
       FROM teacher_exam_questions WHERE id=$1 AND exam_id=$2`,
      [questionId, attempt.exam_id]
    );
    if (questionResult.rows.length === 0) return "question-not-found";
    const question = questionResult.rows[0];
    const selectedOption = String(answer || "").toUpperCase();
    if (!["A", "B", "C", "D"].includes(selectedOption)) return "invalid-answer";

    const answers = attempt.answers || {};
    answers[questionId] = selectedOption.toLowerCase();
    await pool.query(
      "UPDATE teacher_exam_attempts SET answers = $1 WHERE id = $2",
      [JSON.stringify(answers), attemptId]
    );

    const correctOption = String(question.correct_answer || "").toUpperCase();
    await diagnosticEvents.recordOneSafe({
      studentId,
      questionId: question.original_question_id,
      sourceMode: "class_exam",
      sourceRecordId: String(attemptId),
      sourceQuestionId: question.id,
      selectedOption,
      correctOption,
      isCorrect: selectedOption === correctOption,
      responseTimeMs,
      attemptNumber: attempt.attempt_number || 1,
      detectedCefrLevel: question.cefr_level,
      legacySkill: question.skill,
    });

    return "saved";
  }

  return { saveAnswer };
}

module.exports = { createStudentExamAttemptAnswerService };
