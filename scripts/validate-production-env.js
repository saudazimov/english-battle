"use strict";

require("dotenv").config({ quiet: true });

const { validateProductionEnvironment } = require("../src/config/productionEnvironment");

function runProductionEnvironmentCheck({
  environment = process.env,
  logger = console,
  validator = validateProductionEnvironment,
} = {}) {
  validator({ ...environment, NODE_ENV: "production" });
  logger.log("Production konfiguratsiyasi tekshirildi: OK");
}

if (require.main === module) {
  try {
    runProductionEnvironmentCheck();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { runProductionEnvironmentCheck };
