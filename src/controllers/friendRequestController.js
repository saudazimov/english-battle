function createFriendRequestController({
  pool,
  createNotification,
  io,
  onlineUsers,
  logger = console,
}) {
  async function send(req, res) {
    try {
      const requesterId = req.user.id;
      const { receiverId } = req.body;
      logger.log("So'rov keldi:", requesterId, "->", receiverId);
      if (!receiverId) {
        return res.status(400).json({ error: "receiverId kerak" });
      }
      if (String(requesterId) === String(receiverId)) {
        return res.status(400).json({ error: "O'zingizga so'rov yubora olmaysiz" });
      }

      const existing = await pool.query(
        `SELECT * FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
        [requesterId, receiverId]
      );

      if (existing.rows.length > 0) {
        const friendship = existing.rows[0];
        if (friendship.status === "accepted") {
          return res.status(400).json({ error: "Siz allaqachon do'stsiz" });
        }
        return res.status(400).json({ error: "So'rov allaqachon yuborilgan" });
      }

      await pool.query(
        `INSERT INTO friendships (requester_id, receiver_id, status)
       VALUES ($1, $2, 'pending')`,
        [requesterId, receiverId]
      );

      const requesterInfo = await pool.query(
        "SELECT first_name, last_name FROM users WHERE id = $1",
        [requesterId]
      );
      if (requesterInfo.rows.length > 0) {
        const name = requesterInfo.rows[0].first_name + " " + requesterInfo.rows[0].last_name;
        await createNotification(receiverId, "friend_request", name + " sizga do'st so'rovi yubordi");

        const targetSocketId = onlineUsers[String(receiverId)];
        logger.log("So'rov signal:", receiverId, "-> socket:", targetSocketId, "| Onlayn:", Object.keys(onlineUsers));
        if (targetSocketId) {
          io.to(targetSocketId).emit("newFriendRequest", { fromName: name });
          logger.log("Signal yuborildi!");
        } else {
          logger.log("Qabul qiluvchi onlayn emas!");
        }
      }

      return res.json({ message: "So'rov yuborildi!" });
    } catch (error) {
      logger.error("So'rov yuborish xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { send };
}

module.exports = { createFriendRequestController };
