const paymentCreateRoutes = require("./paymentCreateRoutes");
const paymentStatusRoutes = require("./paymentStatusRoutes");
const paymeWebhookRoutes = require("./paymeWebhookRoutes");

const defaultRouteFactories = {
  create: paymentCreateRoutes,
  status: paymentStatusRoutes,
  paymeWebhook: paymeWebhookRoutes,
};

function registerPaymentRoutes({ app, routeFactories = defaultRouteFactories }) {
  app.use(routeFactories.create());
  app.use(routeFactories.status());
  app.use(routeFactories.paymeWebhook());
}

module.exports = registerPaymentRoutes;
