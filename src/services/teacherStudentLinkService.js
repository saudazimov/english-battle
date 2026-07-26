const pool = require("../../db");

function createTeacherStudentLinkService({ pool: database }) {
  async function teacherStudentLinked(teacherId, studentId) {
    const result = await database.query(
      `SELECT 1 FROM class_students cs JOIN classes c ON c.id=cs.class_id
     WHERE c.teacher_id=$1 AND cs.student_id=$2 AND cs.status='active'
       AND c.archived_at IS NULL LIMIT 1`,
      [teacherId, studentId]
    );
    return result.rows.length > 0;
  }

  return { teacherStudentLinked };
}

const { teacherStudentLinked } = createTeacherStudentLinkService({ pool });

module.exports = { createTeacherStudentLinkService, teacherStudentLinked };
