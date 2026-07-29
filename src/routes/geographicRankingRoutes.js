const schoolRankingsRoutes = require("./schoolRankingsRoutes");
const regionRankingsRoutes = require("./regionRankingsRoutes");
const districtRankingsRoutes = require("./districtRankingsRoutes");

function registerGeographicRankingRoutes({ app }) {
  app.use(schoolRankingsRoutes());
  app.use(regionRankingsRoutes());
  app.use(districtRankingsRoutes());
}

module.exports = registerGeographicRankingRoutes;
