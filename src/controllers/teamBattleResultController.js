function createTeamBattleResultController({ pool, logger = console }) {
  return {
    async getResult(req, res) {
      try {
        const userId = req.user.id;
        const roomId = req.params.roomId;

        const sess = await pool.query(
          "SELECT state FROM battle_sessions WHERE room_id = $1 LIMIT 1",
          [roomId]
        );
        if (
          sess.rows.length === 0 ||
          !sess.rows[0].state ||
          !sess.rows[0].state.result_snapshot
        ) {
          return res.status(404).json({ error: "Natija topilmadi" });
        }
        const snap = sess.rows[0].state.result_snapshot;

        const myTeam = snap.playerTeams
          ? snap.playerTeams[String(userId)]
          : null;
        if (!myTeam) {
          return res.status(403).json({ error: "Bu natijaga ruxsat yo'q" });
        }

        const isA = myTeam === "A";
        const myTeamPlayers = isA ? snap.teamA : snap.teamB;
        const enemyTeamPlayers = isA ? snap.teamB : snap.teamA;
        const myTeamScore = isA ? snap.teamAScore : snap.teamBScore;
        const enemyTeamScore = isA ? snap.teamBScore : snap.teamAScore;

        let outcome = "draw";
        if (snap.winningTeam === myTeam) outcome = "win";
        else if (snap.winningTeam !== null) outcome = "lose";

        const me = (myTeamPlayers || []).find(function (p) {
          return String(p.userId) === String(userId);
        });
        const myScore = me ? me.score : 0;

        let xpEarned = 0;
        let ratingChange = 0;
        try {
          const bh = await pool.query(
            "SELECT xp_earned, rating_change FROM battle_history WHERE room_id = $1 AND user_id = $2 LIMIT 1",
            [roomId, userId]
          );
          if (bh.rows[0]) {
            xpEarned = bh.rows[0].xp_earned || 0;
            ratingChange = bh.rows[0].rating_change || 0;
          }
        } catch (error) {}

        res.json({
          teamMode: snap.teamMode,
          level: snap.level,
          total: snap.total_questions,
          outcome: outcome,
          myScore: myScore,
          myTeamScore: myTeamScore,
          enemyTeamScore: enemyTeamScore,
          myTeamPlayers: myTeamPlayers,
          enemyTeamPlayers: enemyTeamPlayers,
          xp_earned: xpEarned,
          rating_change: ratingChange,
        });
      } catch (error) {
        logger.error("Jamoa natija olish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createTeamBattleResultController };
