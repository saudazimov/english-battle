function createMatchmakingQueueRemovalService({ waitingQueue, clearTimeoutFn = clearTimeout }) {
  function clearEntryTimers(entry) {
    if (entry.botTimer) clearTimeoutFn(entry.botTimer);
    if (entry.expandTimers) {
      entry.expandTimers.forEach((timer) => clearTimeoutFn(timer));
    }
  }

  function removeFromQueue(socketId) {
    const index = waitingQueue.findIndex((entry) => entry.socketId === socketId);
    if (index === -1) return null;

    const entry = waitingQueue[index];
    clearEntryTimers(entry);
    waitingQueue.splice(index, 1);
    return entry;
  }

  removeFromQueue.suspend = function suspendQueueEntry(socketId) {
    const entry = waitingQueue.find((item) => item.socketId === socketId);
    if (!entry) return null;
    clearEntryTimers(entry);
    entry.botTimer = null;
    entry.expandTimers = [];
    entry.disconnected = true;
    return entry;
  };

  return removeFromQueue;
}

module.exports = { createMatchmakingQueueRemovalService };
