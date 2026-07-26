const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

// Ulanish urinishlari uchun oddiy in-memory rate-limit (brute-force'ga qarshi)
function createParentLinkAttemptService({ clientIp, now }) {
  const failures = new Map();

  function key(req) {
    return req.user.id + "|" + clientIp(req);
  }

  function parentLinkBlocked(req) {
    const record = failures.get(key(req));
    if (!record) return false;
    if (now() - record.first > WINDOW_MS) {
      failures.delete(key(req));
      return false;
    }
    return record.count >= MAX_FAILURES;
  }

  function parentLinkNoteFail(req) {
    const requestKey = key(req);
    const record = failures.get(requestKey);
    if (!record || now() - record.first > WINDOW_MS) {
      failures.set(requestKey, { count: 1, first: now() });
    } else {
      record.count++;
    }
  }

  function parentLinkNoteOk(req) {
    failures.delete(key(req));
  }

  return { parentLinkBlocked, parentLinkNoteFail, parentLinkNoteOk };
}

module.exports = { createParentLinkAttemptService };
