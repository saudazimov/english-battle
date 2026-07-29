const { mapReviewQuestion } = require("./studentAssignmentReviewService");

function mapAssignmentQuestion(question) {
  return {
    assignment_question_id: question.assignment_question_id,
    q_order: question.q_order,
    question_text: question.question_text,
    options: [
      { key: "A", text: question.option_a },
      { key: "B", text: question.option_b },
      { key: "C", text: question.option_c },
      { key: "D", text: question.option_d },
    ],
  };
}

function createStudentAssignmentStartService({ pool }) {
  async function startAssignment(assignmentId, studentId) {
    const assignmentResult = await pool.query(
      `SELECT a.id, a.title, a.description, a.cefr_level, a.skill, a.question_count, a.due_at, a.status, a.max_attempts
       FROM assignments a
       JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_id = $2 AND cs.status='active'
       JOIN classes c ON c.id = a.class_id AND c.archived_at IS NULL
       WHERE a.id = $1 AND a.status = 'active'`,
      [assignmentId, studentId]
    );
    if (assignmentResult.rows.length === 0) return { status: "not-found" };
    const assignment = assignmentResult.rows[0];

    const submissionResult = await pool.query(
      "SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 ORDER BY attempt_number DESC LIMIT 1",
      [assignmentId, studentId]
    );
    let submission = submissionResult.rows[0] || null;

    if (submission && submission.status === "submitted") {
      const reviewResult = await pool.query(
        `SELECT aq.q_order, aq.question_text, aq.option_a, aq.option_b, aq.option_c, aq.option_d, aq.explanation,
                sa.selected_option, sa.correct_answer, sa.is_correct
         FROM submission_answers sa
         JOIN assignment_questions aq ON aq.id = sa.assignment_question_id
         WHERE sa.submission_id = $1 ORDER BY aq.q_order`,
        [submission.id]
      );
      return {
        status: "locked",
        result: {
          assignment,
          submission,
          locked: true,
          review: reviewResult.rows.map(mapReviewQuestion),
        },
      };
    }

    if (!submission) {
      const inserted = await pool.query(
        `INSERT INTO assignment_submissions (assignment_id, student_id, total, status)
         VALUES ($1, $2, $3, 'in_progress') RETURNING *`,
        [assignmentId, studentId, assignment.question_count]
      );
      submission = inserted.rows[0];
    }

    const questionsResult = await pool.query(
      `SELECT id AS assignment_question_id, q_order, question_text, option_a, option_b, option_c, option_d
       FROM assignment_questions WHERE assignment_id=$1 ORDER BY q_order`,
      [assignmentId]
    );
    return {
      status: "started",
      result: {
        assignment,
        submission,
        locked: false,
        questions: questionsResult.rows.map(mapAssignmentQuestion),
      },
    };
  }

  return { startAssignment };
}

module.exports = { createStudentAssignmentStartService };
