function createCombinedRankingsService({ pool, currentSeason }) {
  return {
    async getRankings(userId, query) {
      const scope = ["schools", "districts", "regions"].includes(query.scope) ? query.scope : "schools";
      const period = ["all", "week", "month", "season"].includes(query.period) ? query.period : "season";
      let within = ["country", "region", "district"].includes(query.within) ? query.within : "country";
      if (scope === "regions") within = "country";
      if (scope === "districts" && within === "district") within = "region";

      const userResult = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
      const me = userResult.rows[0] || {};
      let groupCols, selectCols, fameWhere;
      if (scope === "regions") {
        groupCols = "region"; selectCols = "region";
        fameWhere = "region IS NOT NULL AND region <> ''";
      } else if (scope === "districts") {
        groupCols = "region, district"; selectCols = "region, district";
        fameWhere = "region IS NOT NULL AND region <> '' AND district IS NOT NULL AND district <> ''";
      } else {
        groupCols = "region, district, school"; selectCols = "region, district, school";
        fameWhere = "region IS NOT NULL AND region <> '' AND school IS NOT NULL AND school <> ''";
      }
      const keyOf = (row) => {
        if (scope === "regions") return row.region || "";
        if (scope === "districts") return (row.region || "") + "||" + (row.district || "");
        return (row.region || "") + "||" + (row.district || "") + "||" + (row.school || "");
      };

      const fameParams = [];
      let geoSql = "";
      if (within !== "country" && me.region) {
        fameParams.push(me.region); geoSql += ` AND region = $${fameParams.length}`;
      }
      if (within === "district" && me.district) {
        fameParams.push(me.district); geoSql += ` AND district = $${fameParams.length}`;
      }
      const fameResult = await pool.query(
        `SELECT ${selectCols}, ROUND(AVG(rating))::int AS avg_rating, COUNT(*)::int AS player_count
       FROM users WHERE ${fameWhere}${geoSql} GROUP BY ${groupCols}`,
        fameParams
      );

      const effortConditions = []; const effortParams = [];
      if (period === "week") effortConditions.push("created_at >= date_trunc('week', NOW())");
      else if (period === "month") effortConditions.push("created_at >= date_trunc('month', NOW())");
      else if (period === "season") { effortConditions.push("season = $1"); effortParams.push(currentSeason()); }
      if (within !== "country" && me.region) {
        effortParams.push(me.region); effortConditions.push(`region = $${effortParams.length}`);
      }
      if (within === "district" && me.district) {
        effortParams.push(me.district); effortConditions.push(`district = $${effortParams.length}`);
      }
      const effortWhere = effortConditions.length ? "WHERE " + effortConditions.join(" AND ") : "";
      const effortResult = await pool.query(
        `SELECT ${selectCols}, COALESCE(SUM(points),0)::int AS effort_points, COUNT(DISTINCT user_id)::int AS active_students
       FROM school_battle_points ${effortWhere} GROUP BY ${groupCols}`,
        effortParams
      );
      const effortMap = {};
      effortResult.rows.forEach((row) => { effortMap[keyOf(row)] = row; });

      const FAME_W = 1500, EFFORT_W = 1500, FAME_MIN = 800, FAME_MAX = 2000, EFFORT_K = 1500;
      const fameScore = (average) => Math.max(0, Math.min(1, (average - FAME_MIN) / (FAME_MAX - FAME_MIN))) * FAME_W;
      const effortScore = (points) => EFFORT_W * points / (points + EFFORT_K);
      let rows = fameResult.rows.map((fame) => {
        const effort = effortMap[keyOf(fame)] || {};
        const effortPoints = effort.effort_points || 0;
        const famePoints = Math.round(fameScore(fame.avg_rating));
        const effortPointsScore = Math.round(effortScore(effortPoints));
        return {
          region: fame.region, district: fame.district || null, school: fame.school || null,
          avg_rating: fame.avg_rating, player_count: fame.player_count,
          effort_points: effortPoints, active_students: effort.active_students || 0,
          fame_score: famePoints, effort_score: effortPointsScore, school_rating: famePoints + effortPointsScore,
        };
      });
      rows.sort((a, b) => b.school_rating - a.school_rating || b.effort_points - a.effort_points || b.avg_rating - a.avg_rating);
      rows.forEach((row, index) => { row.rank = index + 1; });

      const mineKey = scope === "regions" ? (me.region || "")
        : scope === "districts" ? (me.region || "") + "||" + (me.district || "")
          : (me.region || "") + "||" + (me.district || "") + "||" + (me.school || "");
      let myEntry = null;
      rows.forEach((row) => {
        row.is_mine = (keyOf(row) === mineKey) && (scope !== "schools" || !!me.school) && (scope !== "districts" || !!me.district) && (scope !== "regions" || !!me.region);
        if (row.is_mine) myEntry = row;
      });

      return { scope, period, within, season: currentSeason(), count: rows.length, total: rows.length, rankings: rows.slice(0, 100), my_entry: myEntry };
    },
  };
}

module.exports = { createCombinedRankingsService };
