function createTeacherConversationMessageSendController({
  pool,
  teacherStudentLinked,
  sanitizeText,
  filterProfanity,
  onlineUsers,
  io,
  createNotification,
  logger = console,
}) {
  async function send(req, res) {
    try {
      const studentId = parseInt(req.params.studentId, 10);
      if (!Number.isInteger(studentId) || !(await teacherStudentLinked(req.user.id, studentId))) {
        return res.status(403).json({ error: "Bu o'quvchi sizning sinfingizda emas" });
      }
      let message = sanitizeText(req.body.message || "", 1000);
      message = filterProfanity(message);
      if (!message) return res.status(400).json({ error: "Xabar bo'sh" });
      const result = await pool.query(
        `INSERT INTO teacher_messages (teacher_id, student_id, sender_id, message)
       VALUES ($1,$2,$1,$3) RETURNING id, sender_id, message, read_at, created_at`,
        [req.user.id, studentId, message]
      );
      const targetSocket = onlineUsers[String(studentId)];
      if (targetSocket) {
        io.to(targetSocket).emit("teacherMessage", {
          teacher_id: req.user.id,
          message: result.rows[0],
        });
      }
      await createNotification(studentId, "teacher_message", "O'qituvchingizdan yangi xabar keldi");
      return res.json({ message: result.rows[0] });
    } catch (error) {
      logger.error("Teacher message send xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { send };
}

module.exports = { createTeacherConversationMessageSendController };
