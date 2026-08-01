function normalizeUserId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const candidate = String(value);
  if (!/^[1-9]\d*$/.test(candidate)) return null;

  const userId = Number(candidate);
  return Number.isSafeInteger(userId) ? String(userId) : null;
}

function registerUserPresenceSocket({
  socket,
  pool,
  onlineUsers,
  notifyFriendsStatus,
  logger = console,
}) {
  socket.on("registerUser", async () => {
    const normalizedUserId = normalizeUserId(socket.userId);

    if (!normalizedUserId) {
      socket.emit("errorMessage", {
        message: "User ID is required.",
      });
      return;
    }

    try {
      const banCheck = await pool.query(
        "SELECT is_banned FROM users WHERE id = $1",
        [normalizedUserId]
      );
      if (banCheck.rows[0] && banCheck.rows[0].is_banned) {
        socket.emit("accountBanned", { message: "Hisobingiz bloklangan." });
        socket.disconnect(true);
        return;
      }
    } catch (error) {
      logger.error("ban check xato:", error.message);
      socket.emit("errorMessage", {
        message: "Unable to verify account status.",
      });
      return;
    }

    socket.userId = normalizedUserId;
    onlineUsers[normalizedUserId] = socket.id;

    logger.log("User online:", normalizedUserId + " (token)");
    notifyFriendsStatus(normalizedUserId, true);

    socket.emit("userRegistered", {
      success: true,
      userId: normalizedUserId,
      socketId: socket.id,
    });
  });
}

module.exports = registerUserPresenceSocket;
