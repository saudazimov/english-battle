function teamTotal(battle, teamIds) {
  return teamIds.reduce(
    (sum, socketId) => sum + (battle.players[socketId] ? battle.players[socketId].score : 0),
    0
  );
}

function allRealPlayersDisconnected(battle, teamIds) {
  const realPlayers = teamIds.filter(
    (socketId) => battle.players[socketId] && !battle.players[socketId].isBot
  );
  if (realPlayers.length === 0) return false;
  return realPlayers.every((socketId) => battle.players[socketId].disconnected);
}

function winningTeamFor(battle, totalA, totalB) {
  const aForfeit = allRealPlayersDisconnected(battle, battle.teams.A);
  const bForfeit = allRealPlayersDisconnected(battle, battle.teams.B);
  if (aForfeit && !bForfeit) return "B";
  if (bForfeit && !aForfeit) return "A";
  if (totalA > totalB) return "A";
  if (totalB > totalA) return "B";
  return null;
}

function teamRoster(battle, teamIds) {
  return teamIds.map((socketId) => {
    const player = battle.players[socketId];
    if (!player) return null;
    return { name: player.name, score: player.score, isBot: player.isBot };
  }).filter((player) => player !== null);
}

function snapshotRoster(battle, teamIds) {
  return teamIds.map((socketId) => {
    const player = battle.players[socketId];
    if (!player) return null;
    return {
      name: player.name,
      userId: player.userId,
      score: player.score,
      isBot: player.isBot,
      level: player.level,
      rating: player.rating,
      profile_picture: player.profile_picture,
      answeredCount: player.answeredCount,
    };
  }).filter((player) => player !== null);
}

function playerOutcome(winningTeam, myTeam) {
  if (winningTeam === myTeam) return { outcome: "win", ratingDelta: 20 };
  if (winningTeam !== null) return { outcome: "lose", ratingDelta: -20 };
  return { outcome: "draw", ratingDelta: 0 };
}

function earnedXp(outcome, formatXp) {
  if (outcome === "win") return formatXp;
  if (outcome === "draw") return Math.round(formatXp / 2);
  return Math.max(1, Math.round(formatXp / 4));
}

async function savePlayerResult({
  pool,
  battle,
  roomId,
  player,
  outcome,
  ratingDelta,
  xpEarned,
  coinsEarned,
  myTeamScore,
  enemyTeamScore,
  getLeagueName,
  updateQuestProgress,
  awardSchoolPoints,
  logger,
}) {
  let updatedUser = null;
  if (!player.userId) return updatedUser;
  try {
    const oldRatingResult = await pool.query("SELECT rating FROM users WHERE id = $1", [player.userId]);
    const oldRating = oldRatingResult.rows[0] ? oldRatingResult.rows[0].rating : 1000;
    let streakSql;
    if (outcome === "win") {
      streakSql = "win_streak = win_streak + 1, best_win_streak = GREATEST(best_win_streak, win_streak + 1)";
    } else if (outcome === "lose") {
      streakSql = "win_streak = 0";
    } else {
      streakSql = "win_streak = win_streak";
    }

    const result = await pool.query(
      `UPDATE users SET xp = xp + $1, coins = coins + $2, rating = GREATEST(0, rating + $3), ${streakSql}
       WHERE id = $4
       RETURNING id, first_name, last_name, username, cefr_level, xp, rating, coins, win_streak, best_win_streak`,
      [xpEarned, coinsEarned, ratingDelta, player.userId]
    );
    if (result.rows.length > 0) {
      updatedUser = result.rows[0];
      const oldLeague = getLeagueName(oldRating);
      const newLeague = getLeagueName(updatedUser.rating);
      if (oldLeague !== newLeague) {
        player.leagueChange = {
          old: oldLeague,
          new: newLeague,
          promoted: updatedUser.rating > oldRating,
        };
      }
    }

    const enemyLabel = (battle.teamMode === "squad" ? "Squad" : "Duo") + " jamoa";
    await pool.query(
      `INSERT INTO battle_history
       (user_id, opponent_name, opponent_id, my_score, opponent_score, outcome, xp_earned, rating_change, cefr_level, mode, total_questions, room_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [player.userId, enemyLabel, null, myTeamScore, enemyTeamScore, outcome, xpEarned, ratingDelta, battle.level || "A1", "school", battle.questions.length, roomId]
    );
    await updateQuestProgress(player.userId, {
      won: outcome === "win",
      correctAnswers: player.score,
      xpEarned,
    });
    const schoolPoints = outcome === "win" ? 15 : (outcome === "draw" ? 7 : 0);
    if (schoolPoints > 0) {
      await awardSchoolPoints(player.userId, schoolPoints, "team_" + outcome);
    }
  } catch (error) {
    logger.error("Jamoa natijani saqlashda xato:", error.message);
  }
  return updatedUser;
}

function createTeamBattleFinishService({
  pool,
  io,
  battles,
  userToRoom,
  recentlyFinished,
  lengthConfig,
  getLeagueName,
  updateQuestProgress,
  awardSchoolPoints,
  finishBattleSession,
  logger = console,
  setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
}) {
  return async function finishTeamBattle(roomId) {
    const battle = battles[roomId];
    if (!battle || battle.finished) return;
    battle.finished = true;

    const totalA = teamTotal(battle, battle.teams.A);
    const totalB = teamTotal(battle, battle.teams.B);
    const winningTeam = winningTeamFor(battle, totalA, totalB);
    const formatXp = lengthConfig(battle.lengthKey).xp;
    const coinsEarned = lengthConfig(battle.lengthKey).coins;
    const rosterA = teamRoster(battle, battle.teams.A);
    const rosterB = teamRoster(battle, battle.teams.B);

    for (const socketId of Object.keys(battle.players)) {
      const player = battle.players[socketId];
      if (player.isBot) continue;
      const myTeam = player.team;
      const { outcome, ratingDelta } = playerOutcome(winningTeam, myTeam);
      const xpEarned = earnedXp(outcome, formatXp);
      const myTeamScore = myTeam === "A" ? totalA : totalB;
      const enemyTeamScore = myTeam === "A" ? totalB : totalA;
      const myRoster = myTeam === "A" ? rosterA : rosterB;
      const enemyRoster = myTeam === "A" ? rosterB : rosterA;
      const updatedUser = await savePlayerResult({
        pool, battle, roomId, player, outcome, ratingDelta, xpEarned, coinsEarned,
        myTeamScore, enemyTeamScore, getLeagueName, updateQuestProgress,
        awardSchoolPoints, logger,
      });

      io.to(socketId).emit("teamBattleEnd", {
        outcome,
        teamMode: battle.teamMode,
        myTeam,
        myTeamScore,
        enemyTeamScore,
        myTeamPlayers: myRoster,
        enemyTeamPlayers: enemyRoster,
        myScore: player.score,
        total: battle.questions.length,
        lengthKey: battle.lengthKey || "standard",
        xp_earned: xpEarned,
        coins_earned: coinsEarned,
        rewards: { xp: xpEarned, coins: coinsEarned, ratingChange: ratingDelta },
        rating_change: ratingDelta,
        updated_user: updatedUser,
        answers: player.answers || [],
        league_change: player.leagueChange || null,
      });
    }

    logger.log("Jamoa jang tugadi [" + battle.teamMode + "]: " + roomId + " | A:" + totalA + " B:" + totalB + " | G'olib: " + (winningTeam || "Durang"));
    Object.keys(battle.players).forEach((socketId) => {
      const player = battle.players[socketId];
      const userId = player.userId;
      if (userId && !player.isBot) {
        if (userToRoom[userId] === roomId) delete userToRoom[userId];
        recentlyFinished[userId] = roomId;
        setTimeoutFn(() => {
          if (recentlyFinished[userId] === roomId) delete recentlyFinished[userId];
        }, 5 * 60 * 1000);
      }
    });
    finishBattleSession(roomId).catch(() => {});

    try {
      const snapshot = {
        isTeamResult: true,
        teamMode: battle.teamMode,
        level: battle.level || "A1",
        total_questions: battle.questions.length,
        winningTeam,
        teamAScore: totalA,
        teamBScore: totalB,
        teamA: snapshotRoster(battle, battle.teams.A),
        teamB: snapshotRoster(battle, battle.teams.B),
        playerTeams: Object.keys(battle.players).reduce((teams, socketId) => {
          const player = battle.players[socketId];
          if (player.userId) teams[String(player.userId)] = player.team;
          return teams;
        }, {}),
      };
      pool.query(
        "UPDATE battle_sessions SET state = state || $2::jsonb, updated_at = NOW() WHERE room_id = $1",
        [roomId, JSON.stringify({ result_snapshot: snapshot })]
      ).catch((error) => logger.error("Jamoa natija snapshot xato:", error.message));
    } catch (error) {
      logger.error("Jamoa snapshot qurish xato:", error.message);
    }

    setTimeoutFn(() => { delete battles[roomId]; }, 30000);
  };
}

module.exports = { createTeamBattleFinishService };
