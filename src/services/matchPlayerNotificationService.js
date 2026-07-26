// Match a'zolariga socket xabar yuborish (onlayn bo'lganlarga)
function createMatchPlayerNotificationService({ pool, io, onlineUsers, logger }) {
  return async function notifyMatchPlayers(matchId, event, payload) {
    try {
      const players = await pool.query(
        "SELECT user_id FROM tournament_match_players WHERE match_id = $1 AND user_id IS NOT NULL",
        [matchId]
      );
      for (const player of players.rows) {
        const socketId = onlineUsers[String(player.user_id)];
        if (socketId) io.to(socketId).emit(event, payload);
      }
    } catch (error) {
      logger.error("notifyMatchPlayers xatosi:", error.message);
    }
  };
}

module.exports = { createMatchPlayerNotificationService };
