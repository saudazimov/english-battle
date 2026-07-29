function createStudentClassJoinService({ pool, premium, logAudit, io }) {
  function emitStudentJoined(classId) {
    io.to("class_" + String(classId)).emit("classStudentJoined", { classId });
  }

  async function joinClass({ req, studentId, joinCode }) {
    const classResult = await pool.query(
      "SELECT id, name, teacher_id, archived_at FROM classes WHERE join_code = $1",
      [joinCode]
    );
    if (classResult.rows.length === 0) return { status: "class-not-found" };
    const classRow = classResult.rows[0];
    if (classRow.archived_at !== null) return { status: "class-inactive" };

    const existing = await pool.query(
      "SELECT id, status FROM class_students WHERE class_id = $1 AND student_id = $2",
      [classRow.id, studentId]
    );
    if (existing.rows.length > 0) {
      if (existing.rows[0].status !== "active") {
        await pool.query(
          "UPDATE class_students SET status = 'active', joined_at = NOW() WHERE id = $1",
          [existing.rows[0].id]
        );
        emitStudentJoined(classRow.id);
        return { status: "rejoined", class: classRow };
      }
      return { status: "already-member" };
    }

    const studentLimit = await premium.checkTeacherLimit(classRow.teacher_id, "students");
    if (!studentLimit.allowed) {
      await logAudit(req, "teacher_limit_blocked_student", {
        entityType: "class",
        entityId: classRow.id,
        details: "teacher=" + classRow.teacher_id + " count=" + studentLimit.current + " limit=" + studentLimit.limit + " plan=free",
      }).catch(() => {});
      return { status: "teacher-limit" };
    }

    await pool.query(
      "INSERT INTO class_students (class_id, student_id, status) VALUES ($1, $2, 'active')",
      [classRow.id, studentId]
    );
    emitStudentJoined(classRow.id);
    return { status: "joined", class: classRow };
  }

  return { joinClass };
}

module.exports = { createStudentClassJoinService };
