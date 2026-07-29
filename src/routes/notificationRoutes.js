const notificationListRoutes = require("./notificationListRoutes");
const notificationReadRoutes = require("./notificationReadRoutes");
const notificationClearRoutes = require("./notificationClearRoutes");
const notificationDeleteRoutes = require("./notificationDeleteRoutes");

function registerNotificationRoutes({ app }) {
  app.use(notificationListRoutes());
  app.use(notificationReadRoutes());
  app.use(notificationClearRoutes());
  app.use(notificationDeleteRoutes());
}

module.exports = registerNotificationRoutes;
