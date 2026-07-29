const registerModerationRoutes = require("./moderationRoutes");
const registerAdminMessageReviewRoutes = require("./adminMessageReviewRoutes");

const defaultRoutes = {
  registerFlags: registerModerationRoutes,
  registerMessageReview: registerAdminMessageReviewRoutes,
};

function registerModerationFeatureRoutes({
  app,
  pool,
  logAudit,
  routes = defaultRoutes,
}) {
  routes.registerFlags({ app, pool, logAudit });
  routes.registerMessageReview({ app });
}

module.exports = registerModerationFeatureRoutes;
