function createTeamMatchEntryService({
  teamMatchPool,
  teamMatchTimers,
  emitTeamQueueStatus,
  tryFormTeamMatch,
  botFillTeamMatch,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  return function addTeamEntry(mode, entry) {
    teamMatchPool[mode].push(entry);
    emitTeamQueueStatus(mode);
    const formed = tryFormTeamMatch(mode);
    if (!formed) {
      if (teamMatchTimers[mode]) clearTimeoutFn(teamMatchTimers[mode]);
      teamMatchTimers[mode] = setTimeoutFn(() => botFillTeamMatch(mode), 15000);
    }
  };
}

module.exports = { createTeamMatchEntryService };
