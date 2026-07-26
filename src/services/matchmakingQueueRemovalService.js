function createMatchmakingQueueRemovalService({ waitingQueue, clearTimeoutFn = clearTimeout }) {
  return function removeFromQueue(socketId) {
    const index = waitingQueue.findIndex((entry) => entry.socketId === socketId);
    if (index === -1) return null;

    const entry = waitingQueue[index];
    if (entry.botTimer) clearTimeoutFn(entry.botTimer);
    if (entry.expandTimers) {
      entry.expandTimers.forEach((timer) => clearTimeoutFn(timer));
    }
    waitingQueue.splice(index, 1);
    return entry;
  };
}

module.exports = { createMatchmakingQueueRemovalService };
