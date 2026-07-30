async function rankIn(pool, rating, condition, params) {
  const result = await pool.query(
    `SELECT COUNT(*) + 1 AS rank FROM users WHERE rating > $1${condition ? " AND " + condition : ""}`,
    [rating, ...params]
  );
  return parseInt(result.rows[0].rank);
}

async function totalIn(pool, condition, params) {
  const result = await pool.query(
    `SELECT COUNT(*) AS c FROM users${condition ? " WHERE " + condition : ""}`,
    params
  );
  return parseInt(result.rows[0].c);
}

function createLeaderboardService({ pool }) {
  return {
    async getLeaderboard(userId, query) {
      const scope = ["global", "national", "region", "district", "school", "friends"].includes(query.scope) ? query.scope : "global";
      const period = ["all", "week", "month", "season"].includes(query.period) ? query.period : "all";
      const userResult = await pool.query("SELECT country, region, district, school FROM users WHERE id = $1", [userId]);
      const me = userResult.rows[0] || {};

      let where = "";
      const params = [];
      if (scope === "national") { params.push(me.country); where = "WHERE u.country = $1"; }
      else if (scope === "region") { params.push(me.region); where = "WHERE u.region = $1"; }
      else if (scope === "district") { params.push(me.region, me.district); where = "WHERE u.region = $1 AND u.district = $2"; }
      else if (scope === "school") { params.push(me.region, me.district, me.school); where = "WHERE u.region = $1 AND u.district = $2 AND u.school = $3"; }
      else if (scope === "friends") {
        const friends = await pool.query(
          `SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
         FROM friendships WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
          [userId]
        );
        const ids = friends.rows.map((row) => row.fid); ids.push(userId);
        params.push(ids); where = "WHERE u.id = ANY($1)";
      }

      let allRows;
      if (period === "all") {
        const result = await pool.query(
          `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.xp, u.profile_picture,
                u.region, u.district, u.school, u.village, u.country,
                COUNT(bh.id) FILTER (WHERE bh.outcome = 'win') AS wins,
                COUNT(bh.id) AS total_battles
         FROM users u
         LEFT JOIN battle_history bh ON bh.user_id = u.id
         ${where}
         GROUP BY u.id
         ORDER BY u.rating DESC, u.xp DESC`,
          params
        );
        allRows = result.rows.map((player) => {
          const total = parseInt(player.total_battles), wins = parseInt(player.wins);
          return {
            id: player.id, first_name: player.first_name, last_name: player.last_name, cefr_level: player.cefr_level,
            rating: player.rating, profile_picture: player.profile_picture,
            region: player.region, district: player.district, school: player.school, village: player.village, country: player.country,
            wins: wins, win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
          };
        });
      } else {
        const startSql = period === "week" ? "date_trunc('week', NOW())" : (period === "month" ? "date_trunc('month', NOW())" : "date_trunc('quarter', NOW())");
        const result = await pool.query(
          `SELECT u.id, u.first_name, u.last_name, u.cefr_level, u.rating, u.profile_picture,
                u.region, u.district, u.school, u.village, u.country,
                COALESCE(SUM(bh.rating_change), 0)::int AS period_gain,
                COUNT(bh.id) FILTER (WHERE bh.outcome = 'win')::int AS period_wins,
                COUNT(bh.id)::int AS period_battles
         FROM users u
         JOIN battle_history bh ON bh.user_id = u.id AND bh.played_at >= ${startSql}
         ${where}
         GROUP BY u.id
         ORDER BY period_gain DESC, period_wins DESC`,
          params
        );
        allRows = result.rows.map((player) => ({
          id: player.id, first_name: player.first_name, last_name: player.last_name, cefr_level: player.cefr_level,
          rating: player.rating, profile_picture: player.profile_picture,
          region: player.region, district: player.district, school: player.school, village: player.village, country: player.country,
          period_gain: player.period_gain, wins: player.period_wins,
          win_rate: player.period_battles > 0 ? Math.round((player.period_wins / player.period_battles) * 100) : 0,
        }));
      }

      const myIndex = allRows.findIndex((player) => player.id === userId);
      const myRank = myIndex >= 0 ? myIndex + 1 : null;
      allRows.forEach((player, index) => { player.rank = index + 1; });
      const players = allRows.slice(0, 50);
      const myEntry = myIndex >= 50 ? allRows[myIndex] : null;
      return { scope, period, players, my_rank: myRank, my_entry: myEntry, total_players: allRows.length };
    },

    async getMyRanks(userId) {
      const userResult = await pool.query("SELECT country, region, district, school, rating FROM users WHERE id = $1", [userId]);
      const me = userResult.rows[0];
      if (!me) return {};
      const myRating = me.rating || 1000;
      const friends = await pool.query(
        `SELECT CASE WHEN requester_id = $1 THEN receiver_id ELSE requester_id END AS fid
       FROM friendships WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
        [userId]
      );
      const friendIds = friends.rows.map((row) => row.fid); friendIds.push(userId);
      const friendRank = await pool.query(
        `SELECT COUNT(*) + 1 AS rank FROM users WHERE id = ANY($2) AND rating > $1`,
        [myRating, friendIds]
      );

      return {
        rating: myRating,
        global: await rankIn(pool, myRating, "", []),
        national: me.country ? await rankIn(pool, myRating, "country = $2", [me.country]) : null,
        region: me.region ? await rankIn(pool, myRating, "region = $2", [me.region]) : null,
        district: (me.region && me.district) ? await rankIn(pool, myRating, "region = $2 AND district = $3", [me.region, me.district]) : null,
        school: (me.region && me.district && me.school) ? await rankIn(pool, myRating, "region = $2 AND district = $3 AND school = $4", [me.region, me.district, me.school]) : null,
        friends: parseInt(friendRank.rows[0].rank),
        total_global: await totalIn(pool, "", []),
        total_region: me.region ? await totalIn(pool, "region = $1", [me.region]) : 0,
        total_district: (me.region && me.district) ? await totalIn(pool, "region = $1 AND district = $2", [me.region, me.district]) : 0,
        total_school: (me.region && me.district && me.school) ? await totalIn(pool, "region = $1 AND district = $2 AND school = $3", [me.region, me.district, me.school]) : 0,
        total_friends: friendIds.length,
      };
    },
  };
}

module.exports = { createLeaderboardService };
