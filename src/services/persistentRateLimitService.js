function createPersistentRateLimitService({ pool, clientIp, logger = console }) {
  function ipOf(req) {
    return clientIp(req);
  }

  function phoneIpKey(req) {
    const phone = req.body && req.body.phone
      ? String(req.body.phone).trim()
      : "no-phone";
    return `${phone}|${ipOf(req)}`;
  }

  function countLimiter(name, options) {
    return async function countLimitMiddleware(req, res, next) {
      const key = String(options.keyFn(req)).slice(0, 240);
      try {
        const result = await pool.query(
          `INSERT INTO request_rate_limits (bucket, key_value, request_count, window_started)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (bucket, key_value) DO UPDATE SET
             request_count = CASE
               WHEN request_rate_limits.blocked_until > NOW() THEN request_rate_limits.request_count
               WHEN request_rate_limits.window_started < NOW() - ($3::bigint * INTERVAL '1 millisecond') THEN 1
               ELSE request_rate_limits.request_count + 1 END,
             window_started = CASE
               WHEN request_rate_limits.window_started < NOW() - ($3::bigint * INTERVAL '1 millisecond') THEN NOW()
               ELSE request_rate_limits.window_started END,
             blocked_until = CASE
               WHEN request_rate_limits.blocked_until > NOW() THEN request_rate_limits.blocked_until
               ELSE NULL END,
             updated_at = NOW()
           RETURNING request_count, blocked_until`,
          [name, key, options.windowMs]
        );
        const record = result.rows[0];
        if (record.blocked_until && new Date(record.blocked_until) > new Date()) {
          const wait = Math.max(1, Math.ceil((new Date(record.blocked_until) - Date.now()) / 60000));
          return res.status(429).json({
            error: `${options.message || "Juda ko'p so'rov."} ${wait} daqiqadan keyin urinib ko'ring.`,
          });
        }
        if (Number(record.request_count) > options.max) {
          await pool.query(
            "UPDATE request_rate_limits SET blocked_until = NOW() + ($3::bigint * INTERVAL '1 millisecond'), updated_at = NOW() WHERE bucket = $1 AND key_value = $2",
            [name, key, options.blockMs]
          );
          return res.status(429).json({
            error: `${options.message || "Juda ko'p so'rov."} ${Math.ceil(options.blockMs / 60000)} daqiqadan keyin urinib ko'ring.`,
          });
        }
        next();
      } catch (error) {
        logger.error("Rate limit DB xatosi:", error.message);
        next();
      }
    };
  }

  function failGate(name, options) {
    return async function failGateMiddleware(req, res, next) {
      const key = String(options.keyFn(req)).slice(0, 240);
      try {
        const result = await pool.query(
          "SELECT blocked_until FROM request_rate_limits WHERE bucket = $1 AND key_value = $2",
          [name, key]
        );
        const blockedUntil = result.rows[0] && result.rows[0].blocked_until;
        if (blockedUntil && new Date(blockedUntil) > new Date()) {
          const wait = Math.max(1, Math.ceil((new Date(blockedUntil) - Date.now()) / 60000));
          return res.status(429).json({
            error: `${options.message || "Juda ko'p noto'g'ri urinish."} ${wait} daqiqadan keyin urinib ko'ring.`,
          });
        }
        next();
      } catch (error) {
        logger.error("Rate limit gate DB xatosi:", error.message);
        next();
      }
    };
  }

  function noteFail(name, key, max, blockMs) {
    pool.query(
      `INSERT INTO request_rate_limits (bucket, key_value, request_count, window_started, blocked_until)
       VALUES ($1, $2, 1, NOW(), NULL)
       ON CONFLICT (bucket, key_value) DO UPDATE SET
         request_count = CASE
           WHEN request_rate_limits.blocked_until IS NOT NULL AND request_rate_limits.blocked_until <= NOW() THEN 1
           WHEN request_rate_limits.window_started < NOW() - ($4::bigint * INTERVAL '1 millisecond') THEN 1
           ELSE request_rate_limits.request_count + 1 END,
         window_started = CASE
           WHEN request_rate_limits.blocked_until IS NOT NULL AND request_rate_limits.blocked_until <= NOW() THEN NOW()
           WHEN request_rate_limits.window_started < NOW() - ($4::bigint * INTERVAL '1 millisecond') THEN NOW()
           ELSE request_rate_limits.window_started END,
         blocked_until = CASE
           WHEN request_rate_limits.blocked_until IS NOT NULL AND request_rate_limits.blocked_until <= NOW() THEN NULL
           WHEN request_rate_limits.request_count + 1 >= $3 THEN NOW() + ($4::bigint * INTERVAL '1 millisecond')
           ELSE request_rate_limits.blocked_until END,
         updated_at = NOW()`,
      [name, String(key).slice(0, 240), max, blockMs]
    ).catch((error) => logger.error("Rate limit fail yozish xatosi:", error.message));
  }

  function noteOk(name, key) {
    pool.query(
      "DELETE FROM request_rate_limits WHERE bucket = $1 AND key_value = $2",
      [name, String(key).slice(0, 240)]
    ).catch((error) => logger.error("Rate limit tozalash xatosi:", error.message));
  }

  return { ipOf, phoneIpKey, countLimiter, failGate, noteFail, noteOk };
}

module.exports = { createPersistentRateLimitService };
