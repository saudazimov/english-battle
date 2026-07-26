function createStudentClassLeaveController({
  pool,
  activeClassMembership,
  io,
  logger = console,
}) {
  return {
    async leave(req, res) {
      try {
        const classId = parseInt(req.params.classId, 10);
        if (!Number.isInteger(classId)) {
          return res.status(400).json({ error: "Noto'g'ri sinf ID" });
        }

        const membership = await activeClassMembership(classId, req.user.id);
        if (!membership) {
          return res.status(404).json({ error: "Siz bu sinfda emassiz" });
        }

        await pool.query(
          "UPDATE class_students SET status='left' WHERE class_id=$1 AND student_id=$2 AND status='active'",
          [classId, req.user.id]
        );
        io.to("class_" + String(classId)).emit("classStudentLeft", {
          classId,
          studentId: req.user.id,
        });
        res.json({ success: true, message: "Sinf tark etildi" });
      } catch (error) {
        logger.error("Sinfni tark etish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createStudentClassLeaveController };
