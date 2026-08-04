"use strict";

require("dotenv").config({ quiet: true });

const { runOffsiteRestoreDrill } = require("../src/services/offsiteRestoreDrillService");
const {
  assertOnlyCliOptions,
  parseCliOptions,
  requiredCliOption,
} = require("../src/utils/cliOptions");

async function main(args = process.argv.slice(2), logger = console) {
  const options = parseCliOptions(args);
  assertOnlyCliOptions(options, [
    "run-id", "target-db", "confirm-target-db", "upload-target", "confirm-upload-target",
  ]);
  const result = await runOffsiteRestoreDrill({
    runId: requiredCliOption(options, "run-id"),
    targetDatabase: requiredCliOption(options, "target-db"),
    databaseConfirmation: requiredCliOption(options, "confirm-target-db"),
    uploadTargetDirectory: requiredCliOption(options, "upload-target"),
    uploadConfirmation: requiredCliOption(options, "confirm-upload-target"),
  });
  logger.log(
    `Off-site restore drill yakunlandi: run=${result.runId}, ` +
    `durationMs=${result.durationMs}, uploadFiles=${result.uploadFileCount}`
  );
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${error.code || "OFFSITE_RESTORE_DRILL_FAILED"}: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
