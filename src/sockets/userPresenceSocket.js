function registerUserPresenceSocket({
  socket,
  pool,
  onlineUsers,
  notifyFriendsStatus,
  logger = console,
}) {
  socket.on("registerUser", async () => {
    const trustedUserId = socket.userId;

    if (!trustedUserId) {
      socket.emit("errorMessage", {
        message: "User ID is required.",
      });
      return;
    }

    const normalizedUserId = String(trustedUserId);

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
