// ecosystem.config.js — PM2 process manager konfiguratsiyasi
// ============================================================================
// IlmLiga single-instance VPS deployment uchun.
//
// ISHLATISH:
//   pm2 start deploy/ecosystem.config.js
//   pm2 save                 # restart'da avtomatik ko'tarilishi uchun
//   pm2 startup              # systemd bilan bootga ulash (chiqqan buyruqni bajaring)
//   pm2 logs english-battle  # loglarni ko'rish
//   pm2 restart english-battle # graceful qayta ishga tushirish
//
// MUHIM: instances=1 va fork rejimi — Redis YO'Q, real-time state RAM'da.
//   Cluster mode (bir nechta instance) HOZIRCHA ISHLATILMAYDI — Socket.IO
//   va matchmaking state bo'linib ketardi. Bu ataylab single-instance.
// ============================================================================

module.exports = {
  apps: [
    {
      name: "english-battle",
      script: "server.js",
      cwd: __dirname + "/..",        // loyiha ildizi (server.js shu yerda)

      // Single-instance — Redis kelgunча cluster YO'Q
      instances: 1,
      exec_mode: "fork",

      // Qayta ishga tushirish siyosati
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",            // 10s'dan oldin yiqilsa — "muvaffaqiyatsiz start" deb sanaydi
      restart_delay: 2000,          // yiqilgach 2s kutib qayta urinadi

      // Xotira chegarasi (leak bo'lsa avtomatik restart)
      max_memory_restart: "500M",

      // Graceful shutdown (server.js'dagi SIGTERM handler bilan mos)
      kill_timeout: 12000,          // SIGTERM'dan keyin 12s kutadi (server.js 10s ichida yopiladi)
      wait_ready: false,

      // Muhit — .env fayl orqali yuklanadi (dotenv server.js ichida).
      // Bu yerda faqat NODE_ENV majburlanadi (env fayl ustidan).
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        TRUST_PROXY_HOPS: "1",
      },

      // Loglar
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
