function registerBattleChatSocket({
  socket,
  io,
  pool,
  battles,
  stripUnsafe,
  filterProfanity,
  logger = console,
}) {
  socket.chatLast = 0;
  socket.chatTimes = [];

  socket.on("battleChatSend", ({ roomId, message }) => {
    const battle = battles[roomId];
    if (!battle || !battle.players[socket.id]) return;
    if (!message || typeof message !== "string") return;

    let text = stripUnsafe(message, 120);
    if (!text) return;
    text = filterProfanity(text);

    const now = Date.now();
    if (now - socket.chatLast < 2000) {
      socket.emit("battleChatError", {
        message: "Juda tez yozyapsiz. Biroz kuting.",
      });
      return;
    }

    socket.chatTimes = socket.chatTimes.filter((time) => now - time < 10000);
    if (socket.chatTimes.length >= 5) {
      socket.emit("battleChatError", {
        message: "Juda ko'p xabar yubordingiz. Biroz kuting.",
      });
      return;
    }
    socket.chatLast = now;
    socket.chatTimes.push(now);

    const sender = battle.players[socket.id];
    io.to(roomId).emit("battleChatMessage", {
      senderId: sender.userId || null,
      senderName: sender.name || "O'yinchi",
      message: text,
      createdAt: new Date().toISOString(),
    });

    if (sender.userId) {
      pool.query(
        "INSERT INTO chat_messages (room_id, sender_id, sender_name, message) VALUES ($1, $2, $3, $4)",
        [roomId, sender.userId, sender.name || "O'yinchi", text]
      ).catch(function (error) {
        logger.error("Chat saqlash xatosi:", error.message);
      });
    }
  });
}

module.exports = registerBattleChatSocket;
