const adminUserMessagesRoutes = require("./adminUserMessagesRoutes");
const adminRoomMessagesRoutes = require("./adminRoomMessagesRoutes");

const defaultRouteFactories = {
  userMessages: adminUserMessagesRoutes,
  roomMessages: adminRoomMessagesRoutes,
};

function registerAdminMessageReviewRoutes({
  app,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.userMessages());
  app.use(routeFactories.roomMessages());
}

module.exports = registerAdminMessageReviewRoutes;
