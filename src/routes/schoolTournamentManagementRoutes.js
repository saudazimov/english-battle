const schoolTournamentsRoutes = require("./schoolTournamentsRoutes");
const schoolTournamentStudentsRoutes = require(
  "./schoolTournamentStudentsRoutes"
);
const schoolTournamentBracketRoutes = require(
  "./schoolTournamentBracketRoutes"
);
const schoolTournamentTeamListRoutes = require(
  "./schoolTournamentTeamListRoutes"
);
const schoolTournamentTeamSaveRoutes = require(
  "./schoolTournamentTeamSaveRoutes"
);

const defaultRouteFactories = {
  tournaments: schoolTournamentsRoutes,
  students: schoolTournamentStudentsRoutes,
  bracket: schoolTournamentBracketRoutes,
  teamList: schoolTournamentTeamListRoutes,
  teamSave: schoolTournamentTeamSaveRoutes,
};

function registerSchoolTournamentManagementRoutes({
  app,
  getSchoolAdmin,
  routeFactories = defaultRouteFactories,
}) {
  app.use(routeFactories.tournaments({ getSchoolAdmin }));
  app.use(routeFactories.students({ getSchoolAdmin }));
  app.use(routeFactories.bracket({ getSchoolAdmin }));
  app.use(routeFactories.teamList({ getSchoolAdmin }));
  app.use(routeFactories.teamSave({ getSchoolAdmin }));
}

module.exports = registerSchoolTournamentManagementRoutes;
