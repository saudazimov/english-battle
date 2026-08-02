"use strict";

const path = require("node:path");
const {
  formatFindings,
  scanTrackedFiles,
} = require("../src/services/secretScanService");

async function main({ projectRoot = path.resolve(__dirname, ".."), logger = console } = {}) {
  const findings = await scanTrackedFiles({ projectRoot });
  if (!findings.length) {
    logger.log("Tracked fayllarda potential secret topilmadi: OK");
    return;
  }

  const error = new Error(
    `Secret scan ${findings.length} ta potential muammo topdi:\n${formatFindings(findings).join("\n")}`
  );
  error.code = "SECRET_SCAN_FAILED";
  error.findings = findings;
  throw error;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
