"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("production operations defines measurable reliability and recovery targets", () => {
  const operations = read("deploy/OPERATIONS.md");

  assert.match(operations, /Availability[\s\S]*99\.5%/);
  assert.match(operations, /API latency[\s\S]*p95 500 ms/);
  assert.match(operations, /RPO: 24 soat/);
  assert.match(operations, /RTO: 4 soat/);
  assert.match(operations, /216 daqiqa \(3 soat 36 daqiqa\)/);
  assert.match(operations, /public\/uploads\/.*uploads\/resources\//s);
  assert.match(operations, /off-site backup/);
  assert.match(operations, /Restore drill har oy/);
});

test("production operations defines alerts, incidents and privacy safeguards", () => {
  const operations = read("deploy/OPERATIONS.md");

  for (const severity of ["SEV-1", "SEV-2", "SEV-3"]) {
    assert.match(operations, new RegExp(severity));
  }
  assert.match(operations, /\/health.*\/ready.*har 60 soniyada/s);
  assert.match(operations, /backup 26 soatdan eski/);
  assert.match(operations, /uncaughtException.*unhandledRejection.*exit 1.*PM2/s);
  assert.match(operations, /Acknowledgement: 10 daqiqa/);
  assert.match(operations, /postmortem/);
  assert.match(operations, /parol, OTP, JWT/);
  assert.match(operations, /Authorization.*Cookie/);
  assert.match(operations, /X-Request-ID.*incident correlation/);
});

test("production operations defines bounded local and external log retention", () => {
  const operations = read("deploy/OPERATIONS.md");

  assert.match(operations, /PM2 app va module loglari.*pm2-logrotate/);
  assert.match(operations, /har kuni.*50M/);
  assert.match(operations, /gzip.*14 ta aylantirilgan arxiv/);
  assert.match(operations, /retain=14.*calendar-day kafolati emas/);
  assert.match(operations, /tashqi markaziy log provider/);
});

test("production operations defines Socket.IO metric semantics and privacy", () => {
  const operations = read("deploy/OPERATIONS.md");

  for (const metric of [
    "socket_auth_accepted_total",
    "socket_auth_rejected_total",
    "socket_handshake_errors_total",
    "socket_connections_total",
    "socket_disconnects_total",
    "socket_connections_active",
    "socket_errors_total",
  ]) {
    assert.match(operations, new RegExp(metric));
  }
  assert.match(operations, /Counterlar process-local.*PM2 restartda noldan boshlanadi/);
  assert.match(operations, /Handshake success SLI.*accepted_total.*rejected_total.*handshake_errors_total/s);
  assert.match(operations, /socket\/user ID, token, payload yoki error message saqlamaydi/);
});

test("production operations includes executable gates and deploy guide linkage", () => {
  const operations = read("deploy/OPERATIONS.md");
  const deployGuide = read("deploy/deploy.md");

  assert.match(operations, /npm run config:check:production/);
  assert.match(operations, /pm2 restart deploy\/ecosystem\.config\.js --update-env/);
  assert.match(operations, /english_battle_restore_test/);
  assert.match(operations, /npm run db:backup:verify/);
  assert.match(operations, /npm run db:restore:drill/);
  assert.match(operations, /--confirm-target/);
  assert.match(operations, /Production databasega `pg_restore --clean` ishlatmang/);
  assert.match(operations, /monitoring provider va ikki on-call egasi tayinlangan/);
  assert.match(operations, /Joriy codebase.*tasdiqlay olmaydi/);
  assert.match(deployGuide, /deploy\/OPERATIONS\.md/);
});
