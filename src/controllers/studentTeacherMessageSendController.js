function createStudentTeacherMessageSendController({
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
      const teacherId = parseInt(req.params.teacherId, 10);
      if (!Number.isInteger(teacherId) || !(await teacherStudentLinked(teacherId, req.user.id))) {
        return res.status(403).json({ error: "Bu o'qituvchi sizning sinfingizga tegishli emas" });
      }
      let message = filterProfanity(sanitizeText(req.body.message || "", 1000));
      if (!message) return res.status(400).json({ error: "Xabar bo'sh" });
      const result = await pool.query(
        `INSERT INTO teacher_messages (teacher_id, student_id, sender_id, message)
       VALUES ($1,$2,$2,$3) RETURNING id, sender_id, message, read_at, created_at`,
        [teacherId, req.user.id, message]
      );
      const targetSocket = onlineUsers[String(teacherId)];
      if (targetSocket) {
        io.to(targetSocket).emit("teacherMessage", {
          student_id: req.user.id,
          message: result.rows[0],
        });
      }
      await createNotification(teacherId, "student_message", "O'quvchingizdan yangi xabar keldi");
      return res.json({ message: result.rows[0] });
    } catch (error) {
      logger.error("Student teacher message xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { send };
}

module.exports = { createStudentTeacherMessageSendController };
