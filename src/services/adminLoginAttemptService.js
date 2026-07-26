function createAdminLoginAttemptService({ failGate, noteFail, noteOk, clientIp }) {
  const ipOf = (req) => clientIp(req);
  const adminLoginRateLimit = failGate("admin_login", {
    keyFn: ipOf,
    message: "Juda ko'p admin kirish urinishi.",
  });

  function recordFailedLogin(req) {
    noteFail("admin_login", ipOf(req), 5, 15 * 60 * 1000);
  }

  function clearLoginAttempts(req) {
    noteOk("admin_login", ipOf(req));
  }

  return { adminLoginRateLimit, recordFailedLogin, clearLoginAttempts };
}

module.exports = { createAdminLoginAttemptService };
