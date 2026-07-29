function createTeacherExamDeleteService({ pool }) {
  async function deleteExam(examId, teacherId) {
    const ownership = await pool.query(
      "SELECT id FROM teacher_exams WHERE id = $1 AND teacher_id = $2",
      [examId, teacherId]
    );
    if (ownership.rows.length === 0) return false;

    await pool.query("DELETE FROM teacher_exams WHERE id = $1", [examId]);
    return true;
  }

  return { deleteExam };
}

module.exports = { createTeacherExamDeleteService };
