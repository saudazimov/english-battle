"use strict";

require("dotenv").config({ quiet: true });

const { runOffsiteBackup } = require("../src/services/offsiteBackupService");

async function main({ environment = process.env, logger = console } = {}) {
  const result = await runOffsiteBackup({ environment });
  logger.log(
    `Off-site backup yakunlandi: ${result.runId} ` +
    `(remote retention: ${result.remoteRemoved}, local retention: ${result.localRemoved})`
  );
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${error.code || "OFFSITE_BACKUP_FAILED"}: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
