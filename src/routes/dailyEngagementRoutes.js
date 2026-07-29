const streakCheckinRoutes = require("./streakCheckinRoutes");
const registerQuestRoutes = require("./questRoutes");

const defaultRoutes = {
  createStreak: streakCheckinRoutes,
  registerQuests: registerQuestRoutes,
};

function registerDailyEngagementRoutes({
  app,
  pool,
  getOrCreateDailyQuests,
  routes = defaultRoutes,
}) {
  app.use(routes.createStreak({ pool }));
  routes.registerQuests({ app, getOrCreateDailyQuests, pool });
}

module.exports = registerDailyEngagementRoutes;
