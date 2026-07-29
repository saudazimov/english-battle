const teacherSettingsProfileReadRoutes = require(
  "./teacherSettingsProfileReadRoutes"
);
const teacherSettingsProfileUpdateRoutes = require(
  "./teacherSettingsProfileUpdateRoutes"
);
const teacherSettingsPasswordRoutes = require("./teacherSettingsPasswordRoutes");

const defaultRouteFactories = {
  read: teacherSettingsProfileReadRoutes,
  update: teacherSettingsProfileUpdateRoutes,
  password: teacherSettingsPasswordRoutes,
};

function registerTeacherSettingsRoutes({
  app,
  sanitizeText,
  validatePassword,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.read());
  app.use(routeFactories.update({ sanitizeText }));
  app.use(routeFactories.password({ validatePassword }));
}

module.exports = registerTeacherSettingsRoutes;
