// Foydalanuvchi onlayn/offlayn bo'lganda, uning do'stlariga xabar berish
function createFriendStatusService({ pool, io, onlineUsers, logger }) {
  return async function notifyFriendsStatus(userId, isOnline) {
    try {
      const result = await pool.query(
        `SELECT requester_id, receiver_id FROM friendships
         WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
        [userId]
      );
      result.rows.forEach((row) => {
        const friendId = String(row.requester_id) === String(userId)
          ? row.receiver_id
          : row.requester_id;
        const friendSocket = onlineUsers[String(friendId)];
        if (friendSocket) {
          io.to(friendSocket).emit("friendStatusChanged", {
            userId: String(userId),
            isOnline: isOnline,
          });
        }
      });
    } catch (error) {
      logger.error("notifyFriendsStatus xatosi:", error.message);
    }
  };
}

module.exports = { createFriendStatusService };
