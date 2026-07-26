function createTeamQueueStatusService({ teamMatchPool, io }) {
  return function emitTeamQueueStatus(mode) {
    const teamSize = mode === "squad" ? 4 : 2;
    const needed = teamSize * 2;
    const pool = teamMatchPool[mode];
    const count = pool.reduce((sum, entry) => sum + entry.size, 0);

    pool.forEach((entry) => {
      entry.players.forEach((player) => {
        if (!player.isBot && player.socketId) {
          io.to(player.socketId).emit("teamQueueUpdate", {
            current: count,
            needed,
            teamMode: mode,
          });
        }
      });
    });
  };
}

module.exports = { createTeamQueueStatusService };
