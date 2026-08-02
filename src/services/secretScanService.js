"use strict";

const { execFile } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_ENV_EXAMPLES = new Set([".env.example", ".env.staging.example"]);
const ALLOWLIST = new Set([
  "tests/http-bootstrap-service.test.js:DATABASE_URL_WITH_CREDENTIALS:30a525aa3da529a8cce1a9a977c097f8fabeb27bb69f4eb1c874598255e99036",
]);
const SECRET_PATTERNS = [
  ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["DATABASE_URL_WITH_CREDENTIALS", /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@/gi],
  ["GITHUB_TOKEN", /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ["AWS_ACCESS_KEY", /AKIA[0-9A-Z]{16}/g],
  ["GOOGLE_API_KEY", /AIza[0-9A-Za-z_-]{30,}/g],
  ["SLACK_TOKEN", /xox[baprs]-[0-9A-Za-z-]{20,}/g],
  ["OPENAI_API_KEY", /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/g],
  ["ANTHROPIC_API_KEY", /sk-ant-[A-Za-z0-9_-]{32,}/g],
  ["NPM_TOKEN", /npm_[A-Za-z0-9]{30,}/g],
  ["JWT", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRelativePath(filePath) {
  return String(filePath).replaceAll("\\", "/");
}

function isSecretFilePath(filePath) {
  const normalized = normalizedRelativePath(filePath);
  const basename = path.posix.basename(normalized).toLowerCase();
  if (ALLOWED_ENV_EXAMPLES.has(basename)) return false;
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  if (/^(?:id_rsa|id_ed25519|id_dsa)(?:\..+)?$/i.test(basename)) return true;
  if (/\.(?:pem|key|p12|pfx)$/i.test(basename)) return true;
  return /^(?:credentials|service-account).*\.json$/i.test(basename);
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (content.charCodeAt(offset) === 10) line += 1;
  }
  return line;
}

function findSecretsInText(filePath, content) {
  const normalized = normalizedRelativePath(filePath);
  const findings = [];

  for (const [rule, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const fingerprint = sha256(match[0]);
      const identity = `${normalized}:${rule}:${fingerprint}`;
      if (!ALLOWLIST.has(identity)) {
        findings.push({
          file: normalized,
          rule,
          line: lineNumberAt(content, match.index),
          fingerprint: fingerprint.slice(0, 12),
        });
      }
    }
  }

  return findings;
}

async function listTrackedFiles(projectRoot, commandRunner = execFileAsync) {
  const result = await commandRunner("git", ["ls-files", "-z"], {
    cwd: projectRoot,
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : String(result.stdout || "");
  return output.split("\0").filter(Boolean);
}

async function scanFiles({ projectRoot, files, fsImpl = fs }) {
  const findings = [];
  for (const file of files) {
    const normalized = normalizedRelativePath(file);
    if (isSecretFilePath(normalized)) {
      findings.push({ file: normalized, rule: "TRACKED_SECRET_FILE", line: 1, fingerprint: "filename" });
      continue;
    }

    const absolutePath = path.resolve(projectRoot, normalized);
    if (!absolutePath.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) {
      throw new Error(`Tracked fayl project rootdan tashqariga chiqadi: ${normalized}`);
    }
    const stats = await fsImpl.stat(absolutePath);
    if (stats.size > MAX_TEXT_FILE_BYTES) {
      const probe = await fsImpl.readFile(absolutePath);
      if (!probe.includes(0)) {
        findings.push({ file: normalized, rule: "TEXT_FILE_TOO_LARGE", line: 1, fingerprint: "size-limit" });
      }
      continue;
    }
    const content = await fsImpl.readFile(absolutePath);
    if (content.includes(0)) continue;
    findings.push(...findSecretsInText(normalized, content.toString("utf8")));
  }
  return findings;
}

async function scanTrackedFiles({
  projectRoot,
  fsImpl = fs,
  commandRunner = execFileAsync,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const files = await listTrackedFiles(root, commandRunner);
  return scanFiles({ projectRoot: root, files, fsImpl });
}

function formatFindings(findings) {
  return findings.map(({ file, rule, line, fingerprint }) =>
    `- ${rule} at ${file}:${line} (fingerprint ${fingerprint})`
  );
}

module.exports = {
  findSecretsInText,
  formatFindings,
  isSecretFilePath,
  scanFiles,
  scanTrackedFiles,
};
