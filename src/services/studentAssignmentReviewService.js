function mapReviewQuestion(row) {
  return {
    q_order: row.q_order,
    question_text: row.question_text,
    options: [
      { key: "A", text: row.option_a },
      { key: "B", text: row.option_b },
      { key: "C", text: row.option_c },
      { key: "D", text: row.option_d },
    ],
    user_answer: row.selected_option,
    correct_answer: row.correct_answer,
    is_correct: row.is_correct,
    explanation: row.explanation,
  };
}

function createStudentAssignmentReviewService({ pool }) {
  async function getReview(assignmentId, studentId) {
    const assignmentResult = await pool.query(
      `SELECT a.id, a.title, a.description, a.cefr_level, a.skill, a.question_count, a.due_at, a.status
       FROM assignments a
       JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = $2 AND cs.status='active'
       JOIN classes c ON c.id = a.class_id
       WHERE a.id = $1`,
      [assignmentId, studentId]
    );
    if (assignmentResult.rows.length === 0) return { status: "not-found" };
    const assignment = assignmentResult.rows[0];

    const submissionResult = await pool.query(
      "SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 AND status='submitted' ORDER BY attempt_number DESC LIMIT 1",
      [assignmentId, studentId]
    );
    if (submissionResult.rows.length === 0) return { status: "not-submitted" };
    const submission = submissionResult.rows[0];

    const reviewResult = await pool.query(
      `SELECT aq.q_order, aq.question_text, aq.option_a, aq.option_b, aq.option_c, aq.option_d, aq.explanation,
              sa.selected_option, sa.correct_answer, sa.is_correct
       FROM submission_answers sa
       JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
       WHERE sa.submission_id = $1 ORDER BY aq.q_order`,
      [submission.id]
    );

    return {
      status: "found",
      result: {
        assignment,
        result: {
          score: submission.score,
          total: submission.total,
          percent: submission.percent,
          correct_count: submission.correct_count,
          wrong_count: submission.wrong_count,
          unanswered_count: submission.unanswered_count,
          is_late: submission.is_late,
          submitted_at: submission.submitted_at,
        },
        review: reviewResult.rows.map(mapReviewQuestion),
      },
    };
  }

  return { getReview };
}

module.exports = { createStudentAssignmentReviewService, mapReviewQuestion };
