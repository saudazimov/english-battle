function createTeamMatchBotFillService({
  teamMatchPool,
  teamMatchTimers,
  makeTeamBot,
  startTeamBattle,
  logger = console,
  clearTimeoutFn = (timer) => clearTimeout(timer),
}) {
  return function botFillTeamMatch(mode) {
    const teamSize = mode === "squad" ? 4 : 2;
    const pool = teamMatchPool[mode];
    if (pool.length === 0) return;

    const available = pool.slice();
    teamMatchPool[mode] = [];
    if (teamMatchTimers[mode]) {
      clearTimeoutFn(teamMatchTimers[mode]);
      delete teamMatchTimers[mode];
    }

    function takeTeam() {
      let team = [];
      for (let index = 0; index < available.length && team.length < teamSize; index++) {
        const entry = available[index];
        if (entry.type === "party" && entry.size <= teamSize - team.length) {
          team = team.concat(entry.players);
          available.splice(index, 1);
          index--;
        }
      }
      for (let index = 0; index < available.length && team.length < teamSize; index++) {
        const entry = available[index];
        if (entry.type === "solo") {
          team = team.concat(entry.players);
          available.splice(index, 1);
          index--;
        }
      }
      return team;
    }

    const teamA = takeTeam();
    const teamB = takeTeam();
    const referencePlayer = teamA[0] || teamB[0];
    let botIndex = 0;
    while (teamA.length < teamSize) teamA.push(makeTeamBot(referencePlayer, botIndex++));
    while (teamB.length < teamSize) teamB.push(makeTeamBot(referencePlayer, botIndex++));

    logger.log(`Jamoa match bot bilan to'ldirildi [${mode}]`);
    startTeamBattle(teamA.concat(teamB), mode, teamSize);
  };
}

module.exports = { createTeamMatchBotFillService };
