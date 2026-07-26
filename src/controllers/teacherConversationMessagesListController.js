function createTeacherConversationMessagesListController({
  pool,
  teacherStudentLinked,
  logger = console,
}) {
  async function list(req, res) {
    try {
      const studentId = parseInt(req.params.studentId, 10);
      if (!Number.isInteger(studentId) || !(await teacherStudentLinked(req.user.id, studentId))) {
        return res.status(403).json({ error: "Bu o'quvchi sizning sinfingizda emas" });
      }
      await pool.query(
        "UPDATE teacher_messages SET read_at=NOW() WHERE teacher_id=$1 AND student_id=$2 AND sender_id=$2 AND read_at IS NULL",
        [req.user.id, studentId]
      );
      const result = await pool.query(
        `SELECT * FROM (
         SELECT id, sender_id, message, read_at, created_at FROM teacher_messages
         WHERE teacher_id=$1 AND student_id=$2 ORDER BY created_at DESC LIMIT 200
       ) recent ORDER BY created_at ASC`,
        [req.user.id, studentId]
      );
      return res.json({ messages: result.rows });
    } catch (error) {
      logger.error("Teacher messages xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createTeacherConversationMessagesListController };
