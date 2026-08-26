const { createBattleRatingService } = require("./battleRatingService");

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
  if (winnerId === playerId) {
    outcome = "win";
  } else if (winnerId !== null) {
    outcome = "lose";
  }

  let xpEarned;
  if (outcome === "win") xpEarned = format.xp;
  else if (outcome === "draw") xpEarned = Math.round(format.xp / 2);
  else xpEarned = Math.max(1, Math.round(format.xp / 4));
  return {
    outcome,
    ratingDelta: 0,
    xpEarned,
    coinsEarned: format.coins,
    rewardsEligible: true,
  };
}

async function savePlayerResult({
  client,
  battle,
  roomId,
  player,
  opponent,
  outcome,
  ratingDelta,
  ratingAudit,
  xpEarned,
  coinsEarned,
  rewardsEligible,
  isCasual,
  getLeagueName,
}) {
  let updatedUser = null;
  if (!player.userId) return updatedUser;
  let streakSql;
  if (outcome === "win") {
    streakSql = "win_streak = win_streak + 1, best_win_streak = GREATEST(best_win_streak, win_streak + 1)";
  } else if (outcome === "lose") {
    streakSql = "win_streak = 0";
  } else {
    streakSql = "win_streak = win_streak";
  }

  const isRated = Boolean(ratingAudit);
  const result = await client.query(
    `UPDATE users
     SET xp = xp + $1,
         coins = coins + $2,
         rating = CASE WHEN $3::boolean THEN $4 ELSE rating END,
         cefr_level = CASE WHEN $3::boolean THEN $5 ELSE cefr_level END,
         ${streakSql}
     WHERE id = $6
     RETURNING id, first_name, last_name, username, cefr_level, xp, rating, coins, win_streak, best_win_streak`,
    [
      xpEarned,
      coinsEarned,
      isRated,
      isRated ? ratingAudit.ratingAfter : null,
      isRated ? ratingAudit.cefrAfter : null,
      player.userId,
    ]
  );
  if (result.rows.length > 0) {
    updatedUser = result.rows[0];
    if (isRated) {
      const oldLeague = getLeagueName(ratingAudit.ratingBefore);
      const newLeague = getLeagueName(updatedUser.rating);
      if (oldLeague !== newLeague) {
        player.leagueChange = {
          old: oldLeague,
          new: newLeague,
          promoted: updatedUser.rating > ratingAudit.ratingBefore,
        };
      }
    }
  }

  await client.query(
    `INSERT INTO battle_history
     (user_id, opponent_name, opponent_id, my_score, opponent_score, outcome,
      xp_earned, rating_change, cefr_level, mode, total_questions, room_id,
      is_rated, rating_before, rating_after, opponent_rating_before, rating_algorithm_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17)`,
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
      isRated,
      isRated ? ratingAudit.ratingBefore : null,
      isRated ? ratingAudit.ratingAfter : null,
      isRated ? ratingAudit.opponentRatingBefore : null,
      isRated ? ratingAudit.algorithmVersion : null,
    ]
  );
  return updatedUser;
}

async function applyPostCommitRewards({
  player,
  outcome,
  xpEarned,
  rewardsEligible,
  isCasual,
  updateQuestProgress,
  awardSchoolPoints,
  logger,
}) {
  if (!player.userId) return;
  try {
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
    logger.error("Jang mukofotlarini yangilashda xato:", error.message);
  }
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
  battleRatingService = createBattleRatingService(),
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
    const isCasual = battle.mode === "casual";
    const playerResults = playerIds.map((playerId) => ({
      playerId,
      player: battle.players[playerId],
      result: resultForPlayer(
        winnerId,
        playerId,
        isCasual,
        lengthConfig(battle.lengthKey),
        isAbandoned
      ),
    }));
    const persistedUsers = new Map();
    const ratedResults = new Map();
    const usersToPersist = playerResults.filter(({ player }) => player.userId);

    if (usersToPersist.length > 0) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ratingPreparation = await battleRatingService.prepareRatedBattle({
          client,
          battle,
          rewardsEligible: !isAbandoned,
          participants: playerResults.map(({ player, result }) => ({
            userId: player.userId,
            outcome: result.outcome,
            answers: player.answers || [],
            correctAnswers: player.score,
            totalAnswers: player.answeredCount || (player.answers || []).length,
          })),
        });
        for (const ratedPlayer of ratingPreparation.players) {
          ratedResults.set(ratedPlayer.userId, ratedPlayer);
        }
        for (const { playerId, player, result } of usersToPersist) {
          const opponentId = playerIds.find((id) => id !== playerId);
          const opponent = battle.players[opponentId];
          const ratingAudit = ratedResults.get(player.userId) || null;
          result.ratingDelta = ratingAudit ? ratingAudit.ratingDelta : 0;
          const updatedUser = await savePlayerResult({
            client,
            battle,
            roomId,
            player,
            opponent,
            ...result,
            ratingAudit,
            isCasual,
            getLeagueName,
          });
          persistedUsers.set(playerId, updatedUser);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        logger.error("Jang natijalarini saqlashda xato:", error.message);
        throw error;
      } finally {
        client.release();
      }
    }

    for (const { playerId, player, result } of playerResults) {
      const opponentId = playerIds.find((id) => id !== playerId);
      const opponent = battle.players[opponentId];
      await applyPostCommitRewards({
        player,
        ...result,
        isCasual,
        updateQuestProgress,
        awardSchoolPoints,
        logger,
      });
      const updatedUser = persistedUsers.get(playerId) || null;
      const opponentPicture = await loadOpponentPicture(pool, opponent);
      const ratingAudit = ratedResults.get(player.userId) || null;

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
        rating_progression: ratingAudit ? {
          rated: true,
          rating_before: ratingAudit.ratingBefore,
          rating_after: ratingAudit.ratingAfter,
          rating_change: ratingAudit.ratingDelta,
          cefr_before: ratingAudit.cefrBefore,
          cefr_after: ratingAudit.cefrAfter,
        } : null,
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
