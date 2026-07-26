const express = require("express");
const { getCountries, getStates, getCities } = require("../../regions");
const { createLocationController } = require("../controllers/locationController");

function createLocationRoutes() {
  const router = express.Router();
  const controller = createLocationController({ getCountries, getStates, getCities });

  router.get("/locations/countries", controller.countries);
  router.get("/locations/states", controller.states);
  router.get("/locations/cities", controller.cities);

  return router;
}

module.exports = { createLocationRoutes };
