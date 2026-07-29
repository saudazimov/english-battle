function createTeacherExamDetailService({ pool }) {
  async function getExamDetail(examId, teacherId) {
    const examResult = await pool.query(
      `SELECT e.*, c.name AS class_name
       FROM teacher_exams e LEFT JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.teacher_id = $2`,
      [examId, teacherId]
    );
    if (examResult.rows.length === 0) return null;

    const questionResult = await pool.query(
      `SELECT q_order, question_text, option_a, option_b, option_c, option_d, skill, difficulty
       FROM teacher_exam_questions WHERE exam_id = $1 ORDER BY q_order`,
      [examId]
    );

    return {
      exam: examResult.rows[0],
      questions: questionResult.rows,
    };
  }

  return { getExamDetail };
}

module.exports = { createTeacherExamDetailService };
