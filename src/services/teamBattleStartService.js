function addTeamPlayers({ team, teamName, players, teamIds, now, deadlineOffset }) {
  team.forEach((player) => {
    players[player.socketId] = {
      userId: player.userId,
      name: player.name,
      socketId: player.socketId,
      level: player.level || "A1",
      rating: player.rating || 1000,
      profile_picture: player.profile_picture || null,
      score: 0,
      finished: false,
      answeredCount: 0,
      answers: [],
      answeredIds: {},
      qDeadline: now() + deadlineOffset,
      team: teamName,
      isBot: !!player.isBot,
    };
    teamIds.push(player.socketId);
  });
}

function safeQuestions(questions) {
  return questions.map((question) => ({
    id: question.id,
    question_text: question.question_text,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
  }));
}

function teamInfo(teamIds, players) {
  return teamIds.map((socketId) => ({
    name: players[socketId].name,
    isBot: players[socketId].isBot,
    userId: players[socketId].userId,
    level: players[socketId].level,
    rating: players[socketId].rating,
    profile_picture: players[socketId].profile_picture,
  }));
}

function createTeamBattleStartService({
  pool,
  io,
  battles,
  userToRoom,
  lengthConfig,
  saveBattleSession,
  simulateTeamBotAnswers,
  firstQuestionGraceMs,
  timePerQuestionMs,
  logger = console,
  now = () => Date.now(),
  random = () => Math.random(),
}) {
  return async function startTeamBattle(group, teamMode, teamSize) {
    try {
      const roomId = "team_" + teamMode + "_" + now() + "_" + Math.floor(random() * 1000);
      const teamA = group.slice(0, teamSize);
      const teamB = group.slice(teamSize, teamSize * 2);
      const lengthKey = group[0].lengthKey || "standard";
      const level = group[0].level || "A1";
      const qCount = lengthConfig(lengthKey).questions;

      let result = await pool.query(
        `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, skill
         FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT $2`,
        [level, qCount]
      );
      if (result.rows.length === 0) {
        result = await pool.query(
          `SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation
           FROM questions ORDER BY RANDOM() LIMIT $1`,
          [qCount]
        );
      }
      const questions = result.rows;
      if (questions.length === 0) {
        group.forEach((player) => {
          io.to(player.socketId).emit("battleError", { message: "Hozircha savollar mavjud emas." });
        });
        return;
      }

      const players = {};
      const teamAIds = [];
      const teamBIds = [];
      const deadlineOffset = firstQuestionGraceMs + timePerQuestionMs;
      addTeamPlayers({ team: teamA, teamName: "A", players, teamIds: teamAIds, now, deadlineOffset });
      addTeamPlayers({ team: teamB, teamName: "B", players, teamIds: teamBIds, now, deadlineOffset });

      battles[roomId] = {
        isTeam: true,
        teamMode,
        battleType: teamMode === "squad" ? "4v4" : "2v2",
        questions,
        level,
        lengthKey,
        createdAt: now(),
        teams: { A: teamAIds, B: teamBIds },
        players,
      };

      teamAIds.concat(teamBIds).forEach((socketId) => {
        const player = players[socketId];
        if (player.userId && !player.isBot) userToRoom[player.userId] = roomId;
      });
      saveBattleSession(roomId, battles[roomId]);

      const clientQuestions = safeQuestions(questions);
      const infoA = teamInfo(teamAIds, players);
      const infoB = teamInfo(teamBIds, players);
      group.forEach((player) => {
        if (player.isBot) return;
        const myTeam = players[player.socketId].team;
        io.to(player.socketId).emit("teamBattleStart", {
          roomId,
          teamMode,
          level,
          total_questions: clientQuestions.length,
          questions: clientQuestions,
          myTeam,
          myTeamPlayers: myTeam === "A" ? infoA : infoB,
          enemyTeamPlayers: myTeam === "A" ? infoB : infoA,
        });
      });

      logger.log("Jamoa jang boshlandi [" + teamMode + "]: " + roomId + " | A:" + teamAIds.length + " B:" + teamBIds.length);
      teamAIds.concat(teamBIds).forEach((socketId) => {
        if (players[socketId].isBot) simulateTeamBotAnswers(roomId, socketId, questions);
      });
    } catch (error) {
      logger.error("startTeamBattle xatosi:", error.message);
    }
  };
}

module.exports = { createTeamBattleStartService };
