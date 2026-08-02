const CLASS_WATCH_WINDOW_MS = 10 * 1000;
const MAX_CLASS_WATCH_ATTEMPTS = 10;

function parseClassId(value) {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const classId = Number(raw);
  return Number.isSafeInteger(classId) ? classId : null;
}

function registerClassWatchSocket(socket, pool, logger = console, now = Date.now) {
  socket.classWatchTimes = [];
  socket.classWatchRooms = new Map();

  socket.on("watchClass", async (value) => {
    const classId = parseClassId(value);
    const authenticatedUserId = socket.authUserId || socket.userId;
    if (!classId || !authenticatedUserId) return;
    if (socket.classWatchRooms.has(classId)) return;

    const currentTime = now();
    socket.classWatchTimes = socket.classWatchTimes.filter(
      (time) => currentTime - time < CLASS_WATCH_WINDOW_MS
    );
    if (socket.classWatchTimes.length >= MAX_CLASS_WATCH_ATTEMPTS) return;
    socket.classWatchTimes.push(currentTime);
    const requestState = {};
    socket.classWatchRooms.set(classId, requestState);

    try {
      const result = await pool.query(
        "SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2",
        [classId, authenticatedUserId]
      );
      if (result.rows.length === 0) {
        if (socket.classWatchRooms.get(classId) === requestState) {
          socket.classWatchRooms.delete(classId);
        }
        return;
      }
      if (socket.classWatchRooms.get(classId) !== requestState) return;
      socket.join("class_" + String(classId));
      socket.classWatchRooms.set(classId, "joined");
    } catch (error) {
      if (socket.classWatchRooms.get(classId) === requestState) {
        socket.classWatchRooms.delete(classId);
      }
      logger.error("Class room tekshirish xatosi:", error.message);
    }
  });

  socket.on("unwatchClass", (value) => {
    const classId = parseClassId(value);
    if (!classId) return;
    socket.classWatchRooms.delete(classId);
    socket.leave("class_" + String(classId));
  });
}

module.exports = registerClassWatchSocket;
