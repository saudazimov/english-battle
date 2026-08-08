const { createAnswerEventService } = require("./answerEventService");

function createExamAttemptGradingService({ pool, answerEventService }) {
  const diagnosticEvents = answerEventService || createAnswerEventService({ pool });
  return async function gradeAttempt(attemptId) {
    const attemptResult = await pool.query(
      "SELECT * FROM teacher_exam_attempts WHERE id = $1",
      [attemptId]
    );
    if (attemptResult.rows.length === 0) return { error: "Urinish topilmadi" };
    const attempt = attemptResult.rows[0];

    const questionResult = await pool.query(
      `SELECT id, original_question_id, correct_answer, skill, cefr_level
       FROM teacher_exam_questions WHERE exam_id = $1`,
      [attempt.exam_id]
    );
    const answers = attempt.answers || {};

    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    questionResult.rows.forEach((question) => {
      const given = (
        answers[question.id] || answers[String(question.id)] || ""
      ).toLowerCase();
      if (!given) unanswered++;
      else if (given === (question.correct_answer || "").toLowerCase()) correct++;
      else wrong++;
    });

    const total = questionResult.rows.length;
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
    const examResult = await pool.query(
      "SELECT pass_percent FROM teacher_exams WHERE id = $1",
      [attempt.exam_id]
    );
    const passPercent = examResult.rows[0]
      ? examResult.rows[0].pass_percent
      : 60;
    const passed = percent >= passPercent;

    await pool.query(
      `UPDATE teacher_exam_attempts
       SET status = 'submitted', submitted_at = NOW(),
           score = $1, total = $2, percent = $3,
           correct_count = $1, wrong_count = $4, unanswered_count = $5, passed = $6
       WHERE id = $7`,
      [correct, total, percent, wrong, unanswered, passed, attemptId]
    );

    await diagnosticEvents.recordManySafe(questionResult.rows.map((question) => {
      const selectedOption = (
        answers[question.id] || answers[String(question.id)] || ""
      ).toUpperCase() || null;
      const correctOption = String(question.correct_answer || "").toUpperCase() || null;
      return {
        studentId: attempt.student_id,
        questionId: question.original_question_id,
        sourceMode: "class_exam",
        sourceRecordId: String(attemptId),
        sourceQuestionId: question.id,
        selectedOption,
        correctOption,
        isCorrect: selectedOption !== null && selectedOption === correctOption,
        attemptNumber: attempt.attempt_number || 1,
        detectedCefrLevel: question.cefr_level,
        legacySkill: question.skill,
      };
    }));

    return {
      success: true,
      score: correct,
      total,
      percent,
      correct_count: correct,
      wrong_count: wrong,
      unanswered_count: unanswered,
      passed,
    };
  };
}

module.exports = { createExamAttemptGradingService };
