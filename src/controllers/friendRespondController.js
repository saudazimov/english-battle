function createFriendRespondController({
  pool,
  createNotification,
  io,
  onlineUsers,
  logger = console,
}) {
  async function respond(req, res) {
    try {
      const myId = req.user.id;
      const { friendshipId, action } = req.body;
      if (!friendshipId || !action) {
        return res.status(400).json({ error: "Ma'lumot yetishmaydi" });
      }

      const friendshipInfo = await pool.query(
        "SELECT requester_id, receiver_id FROM friendships WHERE id = $1",
        [friendshipId]
      );
      if (friendshipInfo.rows.length === 0) {
        return res.status(404).json({ error: "So'rov topilmadi" });
      }
      const requesterId = friendshipInfo.rows[0].requester_id;
      const receiverId = friendshipInfo.rows[0].receiver_id;

      if (String(receiverId) !== String(myId)) {
        return res.status(403).json({ error: "Bu so'rov sizga tegishli emas" });
      }

      if (action === "accept") {
        await pool.query(
          "UPDATE friendships SET status = 'accepted' WHERE id = $1",
          [friendshipId]
        );

        const accepterInfo = await pool.query(
          "SELECT first_name, last_name FROM users WHERE id = $1",
          [receiverId]
        );
        if (accepterInfo.rows.length > 0) {
          const name = accepterInfo.rows[0].first_name + " " + accepterInfo.rows[0].last_name;
          await createNotification(requesterId, "friend_accepted", name + " do'st so'rovingizni qabul qildi");
        }
      } else {
        await pool.query("DELETE FROM friendships WHERE id = $1", [friendshipId]);
      }

      const requesterSocket = onlineUsers[String(requesterId)];
      if (requesterSocket) {
        const responderInfo = await pool.query(
          "SELECT first_name, last_name FROM users WHERE id = $1",
          [receiverId]
        );
        const responderName = responderInfo.rows.length > 0
          ? responderInfo.rows[0].first_name + " " + responderInfo.rows[0].last_name
          : "Foydalanuvchi";
        io.to(requesterSocket).emit("requestResponded", {
          action: action,
          byUserId: receiverId,
          byName: responderName,
        });
      }

      return res.json({ message: action === "accept" ? "Do'st qo'shildi!" : "So'rov rad etildi" });
    } catch (error) {
      logger.error("So'rovga javob xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { respond };
}

module.exports = { createFriendRespondController };
