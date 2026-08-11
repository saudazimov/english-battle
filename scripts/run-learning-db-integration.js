"use strict";

require("dotenv").config();
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname,"..");
const integrationTest = path.join(projectRoot,"tests","learning-review-postgres.integration.test.js");
const integrationTimeoutMs = 30000;

function validateIntegrationEnvironment(environment) {
  if (String(environment.NODE_ENV || "").toLowerCase() === "production") {
    throw new Error("Learning DB integration test production muhitida ishlamaydi");
  }
  const host = String(environment.DB_HOST || "").trim().toLowerCase();
  const localHosts = new Set(["","localhost","127.0.0.1","::1"]);
  const explicitlyAllowed = String(environment.ALLOW_NONLOCAL_DB_INTEGRATION || "").toLowerCase() === "true";
  if (!localHosts.has(host) && !explicitlyAllowed) {
    throw new Error("Non-local DB uchun ALLOW_NONLOCAL_DB_INTEGRATION=true talab qilinadi");
  }
}

function runLearningDbIntegration({ spawn = spawnSync,env = process.env,logger = console } = {}) {
  try {
    validateIntegrationEnvironment(env);
  } catch (error) {
    logger.error("Learning DB integration test blocked:",error.message);
    return 1;
  }
  const result = spawn(process.execPath,["--test",integrationTest],{
    cwd: projectRoot,
    env: { ...env,RUN_DB_INTEGRATION: "true" },
    stdio: "inherit",
    timeout: integrationTimeoutMs,
    killSignal: "SIGTERM",
    windowsHide: true,
  });
  if (result.error) {
    logger.error("Unable to start the learning DB integration test:",result.error);
    return 1;
  }
  return result.status === null ? 1 : result.status;
}

if (require.main === module) {
  process.exitCode = runLearningDbIntegration();
}

module.exports = {
  integrationTest,integrationTimeoutMs,runLearningDbIntegration,validateIntegrationEnvironment,
};
