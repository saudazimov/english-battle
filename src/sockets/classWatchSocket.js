function parseClassId(value) {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const classId = Number(raw);
  return Number.isSafeInteger(classId) ? classId : null;
}

function registerClassWatchSocket(socket, pool, logger = console) {
  socket.on("watchClass", async (value) => {
    const classId = parseClassId(value);
    const authenticatedUserId = socket.authUserId || socket.userId;
    if (!classId || !authenticatedUserId) return;

    try {
      const result = await pool.query(
        "SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2",
        [classId, authenticatedUserId]
      );
      if (result.rows.length === 0) return;
      socket.join("class_" + String(classId));
    } catch (error) {
      logger.error("Class room tekshirish xatosi:", error.message);
    }
  });

  socket.on("unwatchClass", (value) => {
    const classId = parseClassId(value);
    if (!classId) return;
    socket.leave("class_" + String(classId));
  });
}

module.exports = registerClassWatchSocket;
