"use strict";

// Staging alohida deploy katalogi, database va provider credentiallari bilan ishlaydi.
// Haqiqiy secretlar ushbu faylda emas, staging hostdagi `.env` faylida saqlanadi.
module.exports = {
  apps: [
    {
      name: "english-battle-staging",
      script: "server.js",
      cwd: __dirname + "/..",

      // Redis joriy qilinmaguncha production kabi bitta process.
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 2000,
      max_memory_restart: "500M",
      kill_timeout: 12000,
      wait_ready: false,

      // NODE_ENV=production stagingda ham production security guardlarini yoqadi.
      // PORT alohida bo'lgani uchun production process bilan to'qnashmaydi.
      env: {
        NODE_ENV: "production",
        PORT: "3100",
      },

      error_file: "./logs/staging-pm2-error.log",
      out_file: "./logs/staging-pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
