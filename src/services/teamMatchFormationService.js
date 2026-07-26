function createTeamMatchFormationService({
  teamMatchPool,
  teamMatchTimers,
  startTeamBattle,
  logger = console,
  clearTimeoutFn = (timer) => clearTimeout(timer),
}) {
  return function tryFormTeamMatch(mode) {
    const teamSize = mode === "squad" ? 4 : 2;
    const pool = teamMatchPool[mode];
    if (pool.length === 0) return false;

    function assembleTeam(available) {
      let team = [];
      const used = [];

      for (let index = 0; index < available.length && team.length < teamSize; index++) {
        const entry = available[index];
        if (entry.type === "party" && entry.size <= teamSize - team.length) {
          team = team.concat(entry.players);
          used.push(entry.id);
          available.splice(index, 1);
          index--;
        }
      }

      for (let index = 0; index < available.length && team.length < teamSize; index++) {
        const entry = available[index];
        if (entry.type === "solo") {
          team = team.concat(entry.players);
          used.push(entry.id);
          available.splice(index, 1);
          index--;
        }
      }
      return team.length === teamSize ? { team, used } : null;
    }

    const available = pool.slice();
    const teamA = assembleTeam(available);
    if (!teamA) return false;
    const teamB = assembleTeam(available);
    if (!teamB) return false;

    const usedIds = teamA.used.concat(teamB.used);
    teamMatchPool[mode] = pool.filter((entry) => usedIds.indexOf(entry.id) === -1);
    if (teamMatchPool[mode].length === 0 && teamMatchTimers[mode]) {
      clearTimeoutFn(teamMatchTimers[mode]);
      delete teamMatchTimers[mode];
    }

    logger.log(`Jamoa match topildi [${mode}]: A=${teamA.team.length} B=${teamB.team.length} (haqiqiy o'yinchilar)`);
    startTeamBattle(teamA.team.concat(teamB.team), mode, teamSize);
    return true;
  };
}

module.exports = { createTeamMatchFormationService };
