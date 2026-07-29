const friendSearchRoutes = require("./friendSearchRoutes");
const friendSuggestedRoutes = require("./friendSuggestedRoutes");
const friendRequestRoutes = require("./friendRequestRoutes");
const friendRespondRoutes = require("./friendRespondRoutes");
const friendRemoveRoutes = require("./friendRemoveRoutes");
const friendRequestsRoutes = require("./friendRequestsRoutes");
const friendListRoutes = require("./friendListRoutes");
const friendWinsRoutes = require("./friendWinsRoutes");
const friendActivityRoutes = require("./friendActivityRoutes");

const defaultRouteFactories = {
  search: friendSearchRoutes,
  suggested: friendSuggestedRoutes,
  request: friendRequestRoutes,
  respond: friendRespondRoutes,
  remove: friendRemoveRoutes,
  requests: friendRequestsRoutes,
  list: friendListRoutes,
  wins: friendWinsRoutes,
  activity: friendActivityRoutes,
};

function registerFriendRoutes({
  app,
  createNotification,
  io,
  onlineUsers,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.search());
  app.use(routeFactories.suggested());
  app.use(routeFactories.request({ createNotification, io, onlineUsers }));
  app.use(routeFactories.respond({ createNotification, io, onlineUsers }));
  app.use(routeFactories.remove({ io, onlineUsers }));
  app.use(routeFactories.requests());
  app.use(routeFactories.list({ onlineUsers }));
  app.use(routeFactories.wins());
  app.use(routeFactories.activity());
}

module.exports = registerFriendRoutes;
