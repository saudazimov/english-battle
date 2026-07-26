function createMatchmakingQueueMatchService({
  waitingQueue,
  mmCompatible,
  removeFromQueue,
  pairPlayers,
}) {
  return function tryQueueMatch(socketId) {
    const player = waitingQueue.find((entry) => entry.socketId === socketId);
    if (!player) return false;

    const opponent = waitingQueue.find(
      (entry) =>
        entry.socketId !== socketId &&
        String(entry.userId) !== String(player.userId) &&
        mmCompatible(entry, player)
    );
    if (!opponent) return false;

    removeFromQueue(player.socketId);
    removeFromQueue(opponent.socketId);
    pairPlayers(opponent, player);
    return true;
  };
}

module.exports = { createMatchmakingQueueMatchService };
