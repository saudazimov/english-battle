const examStatusRoutes = require("./examStatusRoutes");
const examStartRoutes = require("./examStartRoutes");
const examSubmitRoutes = require("./examSubmitRoutes");
const examHistoryRoutes = require("./examHistoryRoutes");

const defaultRouteFactories = {
  status: examStatusRoutes,
  start: examStartRoutes,
  submit: examSubmitRoutes,
  history: examHistoryRoutes,
};

function registerLevelExamRoutes({
  app,
  pool,
  getNextLevel,
  randomUUID,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.status({ pool, getNextLevel }));
  app.use(routeFactories.start({ pool, randomUUID }));
  app.use(routeFactories.submit({ pool, getNextLevel }));
  app.use(routeFactories.history({ pool }));
}

module.exports = registerLevelExamRoutes;
