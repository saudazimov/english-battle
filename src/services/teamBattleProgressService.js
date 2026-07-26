function createTeamBattleProgressService({ battles, io }) {
  return function emitTeamProgress(roomId) {
    const battle = battles[roomId];
    if (!battle) return;

    function teamProgress(socketIds) {
      return socketIds.map((socketId) => {
        const player = battle.players[socketId];
        if (!player) return null;
        return {
          name: player.name,
          answeredCount: player.answeredCount,
          score: player.score,
          finished: player.finished,
          isBot: player.isBot,
          level: player.level,
          rating: player.rating,
        };
      }).filter((player) => player !== null);
    }

    const progressA = teamProgress(battle.teams.A);
    const progressB = teamProgress(battle.teams.B);
    const totalA = progressA.reduce((sum, player) => sum + player.score, 0);
    const totalB = progressB.reduce((sum, player) => sum + player.score, 0);

    Object.keys(battle.players).forEach((socketId) => {
      const player = battle.players[socketId];
      if (player.isBot) return;
      const myTeam = player.team;
      io.to(socketId).emit("teamProgress", {
        myTeamPlayers: myTeam === "A" ? progressA : progressB,
        enemyTeamPlayers: myTeam === "A" ? progressB : progressA,
        myTeamScore: myTeam === "A" ? totalA : totalB,
        enemyTeamScore: myTeam === "A" ? totalB : totalA,
      });
    });
  };
}

module.exports = { createTeamBattleProgressService };
