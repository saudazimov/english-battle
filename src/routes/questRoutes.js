const questListRoutes = require("./questListRoutes");
const questClaimRoutes = require("./questClaimRoutes");

function registerQuestRoutes({ app, getOrCreateDailyQuests, pool }) {
  app.use(questListRoutes({ getOrCreateDailyQuests }));
  app.use(questClaimRoutes({ pool }));
}

module.exports = registerQuestRoutes;
