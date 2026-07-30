"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const testsRoot = path.join(projectRoot, "tests");

function collectTestFiles(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTestFiles(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isServerReady(baseUrl) {
  try {
    const response = await fetch(new URL("/ready", baseUrl), {
      signal: AbortSignal.timeout(1_000),
    });
    return response.status === 200;
  } catch (_) {
    return false;
  }
}

async function waitForServer(baseUrl, child, timeoutMilliseconds = 30_000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited before readiness with code ${child.exitCode}.`);
    }
    if (await isServerReady(baseUrl)) return;
    await delay(250);
  }

  throw new Error(`Test server did not become ready within ${timeoutMilliseconds}ms.`);
}

async function ensureTestServer() {
  const configuredBaseUrl = process.env.E2E_BASE_URL;
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const localBaseUrl = `http://127.0.0.1:${port}`;
  const baseUrl = configuredBaseUrl || localBaseUrl;

  if (await isServerReady(baseUrl)) return null;
  if (configuredBaseUrl) {
    throw new Error(`Configured E2E server is not ready: ${configuredBaseUrl}`);
  }

  const child = spawn(process.execPath, [path.join(projectRoot, "server.js")], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit",
    windowsHide: true,
  });

  try {
    await waitForServer(localBaseUrl, child);
    return child;
  } catch (error) {
    if (child.exitCode === null) child.kill("SIGTERM");
    throw error;
  }
}

async function stopTestServer(child) {
  if (!child || child.exitCode !== null) return;

  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(15_000)]);

  if (child.exitCode === null) child.kill("SIGKILL");
}

async function runFullSuite() {
  const testFiles = collectTestFiles(testsRoot);

  if (testFiles.length === 0) {
    console.error("No test files were found under tests/.");
    return 1;
  }

  let testServer = null;
  try {
    testServer = await ensureTestServer();
    const result = spawnSync(process.execPath, ["--test", ...testFiles], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });

    if (result.error) {
      console.error("Unable to start the full test suite:", result.error);
      return 1;
    }

    return result.status === null ? 1 : result.status;
  } finally {
    await stopTestServer(testServer);
  }
}

if (require.main === module) {
  runFullSuite()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      console.error("Full test suite setup failed:", error);
      process.exitCode = 1;
    });
}

module.exports = {
  collectTestFiles,
  ensureTestServer,
  isServerReady,
  runFullSuite,
  stopTestServer,
};
