const test = require("node:test");
const assert = require("node:assert/strict");

const { createParentLinkAttemptService } = require("../src/services/parentLinkAttemptService");

function createService(initialNow = 1_000) {
  let currentTime = initialNow;
  const service = createParentLinkAttemptService({
    clientIp(req) { return req.ip; },
    now() { return currentTime; },
  });
  return {
    ...service,
    setNow(value) { currentTime = value; },
  };
}

function request(userId = 7, ip = "127.0.0.1") {
  return { user: { id: userId }, ip };
}

test("parent-link attempts preserve five-failure blocking threshold", () => {
  const service = createService();
  const req = request();

  for (let count = 0; count < 4; count++) {
    service.parentLinkNoteFail(req);
    assert.equal(service.parentLinkBlocked(req), false);
  }
  service.parentLinkNoteFail(req);

  assert.equal(service.parentLinkBlocked(req), true);
});

test("parent-link attempts preserve ten-minute expiry boundary", () => {
  const service = createService(5_000);
  const req = request();
  for (let count = 0; count < 5; count++) service.parentLinkNoteFail(req);

  service.setNow(5_000 + (10 * 60 * 1000));
  assert.equal(service.parentLinkBlocked(req), true);

  service.setNow(5_000 + (10 * 60 * 1000) + 1);
  assert.equal(service.parentLinkBlocked(req), false);
  assert.equal(service.parentLinkBlocked(req), false);
});

test("parent-link attempts preserve success reset", () => {
  const service = createService();
  const req = request();
  for (let count = 0; count < 5; count++) service.parentLinkNoteFail(req);
  assert.equal(service.parentLinkBlocked(req), true);

  service.parentLinkNoteOk(req);

  assert.equal(service.parentLinkBlocked(req), false);
});

test("parent-link attempts preserve user and IP isolation", () => {
  const service = createService();
  const blockedRequest = request(7, "10.0.0.1");
  for (let count = 0; count < 5; count++) service.parentLinkNoteFail(blockedRequest);

  assert.equal(service.parentLinkBlocked(blockedRequest), true);
  assert.equal(service.parentLinkBlocked(request(8, "10.0.0.1")), false);
  assert.equal(service.parentLinkBlocked(request(7, "10.0.0.2")), false);
});
