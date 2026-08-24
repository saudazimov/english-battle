function findWinnerId(playerIds, players) {
  const player1 = players[playerIds[0]];
  const player2 = players[playerIds[1]];
  if (player1.disconnected && !player2.disconnected) return playerIds[1];
  if (player2.disconnected && !player1.disconnected) return playerIds[0];
  if (player1.score > player2.score) return playerIds[0];
  if (player2.score > player1.score) return playerIds[1];
  return null;
}

function resultForPlayer(winnerId, playerId, isCasual, format, isAbandoned = false) {
  if (isAbandoned) {
    return {
      outcome: "draw",
      ratingDelta: 0,
      xpEarned: 0,
      coinsEarned: 0,
      rewardsEligible: false,
    };
  }

  let outcome = "draw";
  let ratingDelta = 0;
  if (winnerId === playerId) {
    outcome = "win";
    ratingDelta = 20;
  } else if (winnerId !== null) {
    outcome = "lose";
    ratingDelta = -20;
  }
  if (isCasual) ratingDelta = 0;

  let xpEarned;
  if (outcome === "win") xpEarned = format.xp;
  else if (outcome === "draw") xpEarned = Math.round(format.xp / 2);
  else xpEarned = Math.max(1, Math.round(format.xp / 4));
  return {
    outcome,
    ratingDelta,
    xpEarned,
    coinsEarned: format.coins,
    rewardsEligible: true,
  };
}

async function savePlayerResult({
  pool,
  battle,
  roomId,
  player,
  opponent,
  outcome,
  ratingDelta,
  xpEarned,
  coinsEarned,
  rewardsEligible,
  isCasual,
  getLeagueName,
  updateQuestProgress,
  awardSchoolPoints,
  logger,
}) {
  let updatedUser = null;
  if (!player.userId) return updatedUser;
  try {
    const oldRatingResult = await pool.query(
      "SELECT rating FROM users WHERE id = $1",
      [player.userId]
    );
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
      `UPDATE users
       SET xp = xp + $1,
           coins = coins + $2,
           rating = GREATEST(0, rating + $3),
           ${streakSql}
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

    await pool.query(
      `INSERT INTO battle_history
       (user_id, opponent_name, opponent_id, my_score, opponent_score, outcome, xp_earned, rating_change, cefr_level, mode, total_questions, room_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        player.userId,
        opponent.name,
        opponent.userId || null,
        player.score,
        opponent.score,
        outcome,
        xpEarned,
        ratingDelta,
        battle.level || "A1",
        battle.mode === "casual" ? "casual" : "ranked",
        battle.questions.length,
        roomId,
      ]
    );
    await updateQuestProgress(player.userId, {
      won: outcome === "win",
      correctAnswers: player.score,
      xpEarned,
    });
    if (!isCasual && rewardsEligible) {
      const schoolPoints = outcome === "win" ? 10 : (outcome === "draw" ? 5 : 0);
      if (schoolPoints > 0) {
        await awardSchoolPoints(player.userId, schoolPoints, "ranked_" + outcome);
      }
    }
  } catch (error) {
    logger.error("Natijani saqlashda xato:", error.message);
  }
  return updatedUser;
}

async function loadOpponentPicture(pool, opponent) {
  let picture = null;
  if (opponent.userId) {
    try {
      const result = await pool.query(
        "SELECT profile_picture FROM users WHERE id = $1",
        [opponent.userId]
      );
      if (result.rows[0]) picture = result.rows[0].profile_picture;
    } catch (profileLookupError) {
      void profileLookupError;
    }
  }
  return picture;
}

function createBattleFinishService({
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
  return async function finishBattle(roomId) {
    const battle = battles[roomId];
    if (!battle) return;
    const playerIds = Object.keys(battle.players);
    const winnerId = findWinnerId(playerIds, battle.players);
    const isAbandoned = playerIds.length === 2 && playerIds.every(
      (playerId) => battle.players[playerId].disconnected === true
    );

    for (const playerId of playerIds) {
      const player = battle.players[playerId];
      const opponentId = playerIds.find((id) => id !== playerId);
      const opponent = battle.players[opponentId];
      const isCasual = battle.mode === "casual";
      const result = resultForPlayer(
        winnerId,
        playerId,
        isCasual,
        lengthConfig(battle.lengthKey),
        isAbandoned
      );
      const updatedUser = await savePlayerResult({
        pool,
        battle,
        roomId,
        player,
        opponent,
        ...result,
        isCasual,
        getLeagueName,
        updateQuestProgress,
        awardSchoolPoints,
        logger,
      });
      const opponentPicture = await loadOpponentPicture(pool, opponent);

      io.to(playerId).emit("battleEnd", {
        outcome: result.outcome,
        your_score: player.score,
        opponent_score: opponent.score,
        total: battle.questions.length,
        lengthKey: battle.lengthKey || "standard",
        mode: battle.mode || "ranked",
        xp_earned: result.xpEarned,
        coins_earned: result.coinsEarned,
        rewards: {
          xp: result.xpEarned,
          coins: result.coinsEarned,
          ratingChange: result.ratingDelta,
        },
        rating_change: result.ratingDelta,
        updated_user: updatedUser,
        answers: player.answers || [],
        league_change: player.leagueChange || null,
        opponent_picture: opponentPicture,
      });
    }

    logger.log("Jang tugadi va saqlandi, xona:", roomId);
    await finishBattleSession(roomId);
    for (const playerId of playerIds) {
      const userId = battle.players[playerId] && battle.players[playerId].userId;
      if (userId) {
        if (userToRoom[userId] === roomId) delete userToRoom[userId];
        recentlyFinished[userId] = roomId;
        setTimeoutFn(() => {
          if (recentlyFinished[userId] === roomId) delete recentlyFinished[userId];
        }, 5 * 60 * 1000);
      }
    }
    delete battles[roomId];
  };
}

module.exports = { createBattleFinishService };
