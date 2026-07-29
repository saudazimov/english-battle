function createTeacherStudentRemovalService({ pool }) {
  async function removeStudent({ teacherId, classId, studentId }) {
    const classCheck = await pool.query(
      "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
      [classId, teacherId]
    );
    if (classCheck.rows.length === 0) return "class-not-found";

    const membership = await pool.query(
      "SELECT id FROM class_students WHERE class_id = $1 AND student_id = $2 AND status = 'active'",
      [classId, studentId]
    );
    if (membership.rows.length === 0) return "student-not-found";

    await pool.query(
      "UPDATE class_students SET status = 'removed' WHERE class_id = $1 AND student_id = $2",
      [classId, studentId]
    );

    return "removed";
  }

  return { removeStudent };
}

module.exports = { createTeacherStudentRemovalService };
