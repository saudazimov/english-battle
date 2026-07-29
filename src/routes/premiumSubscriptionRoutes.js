const subscriptionRoutes = require("./subscriptionRoutes");
const devSubscriptionActivateRoutes = require(
  "./devSubscriptionActivateRoutes"
);

const defaultRouteFactories = {
  current: subscriptionRoutes,
  devActivate: devSubscriptionActivateRoutes,
};

function registerPremiumSubscriptionRoutes({
  app,
  premium,
  logAudit,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.current());
  app.use(routeFactories.devActivate({ premium, logAudit }));
}

module.exports = registerPremiumSubscriptionRoutes;
