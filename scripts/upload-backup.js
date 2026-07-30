"use strict";

const path = require("node:path");
const {
  createUploadSnapshot,
  runUploadRestoreDrill,
  verifyUploadSnapshot,
} = require("../src/services/uploadBackupService");
const {
  assertOnlyCliOptions,
  parseCliOptions,
  requiredCliOption,
} = require("../src/utils/cliOptions");

async function main(args = process.argv.slice(2), logger = console) {
  const [command, ...rawOptions] = args;
  const options = parseCliOptions(rawOptions);
  const projectRoot = path.resolve(__dirname, "..");

  if (command === "create") {
    assertOnlyCliOptions(options, ["output"]);
    const result = await createUploadSnapshot({
      projectRoot,
      outputDirectory: requiredCliOption(options, "output"),
    });
    logger.log(`Upload snapshot yaratildi va tekshirildi: ${result.snapshotDirectory}`);
    return;
  }
  if (command === "verify") {
    assertOnlyCliOptions(options, ["snapshot"]);
    const snapshot = path.resolve(requiredCliOption(options, "snapshot"));
    const manifest = await verifyUploadSnapshot({ snapshotDirectory: snapshot });
    logger.log(`Upload snapshot tekshirildi: ${snapshot} (${manifest.files.length} fayl)`);
    return;
  }
  if (command === "restore-drill") {
    assertOnlyCliOptions(options, ["snapshot", "target", "confirm-target"]);
    const result = await runUploadRestoreDrill({
      projectRoot,
      snapshotDirectory: requiredCliOption(options, "snapshot"),
      targetDirectory: requiredCliOption(options, "target"),
      confirmation: requiredCliOption(options, "confirm-target"),
    });
    logger.log(`Upload restore drill yakunlandi: ${result.targetDirectory}`);
    return;
  }
  throw new Error("Buyruq create, verify yoki restore-drill bo'lishi kerak.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
