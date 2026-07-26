const test = require("node:test");
const assert = require("node:assert/strict");
const { validMeetingUrl } = require("../src/utils/meetingUrl");

test("meeting URL accepts HTTP and HTTPS URLs", () => {
  assert.equal(validMeetingUrl("https://meet.example.com/lesson"), true);
  assert.equal(validMeetingUrl("http://localhost:3000/lesson"), true);
});

test("meeting URL rejects unsupported protocols", () => {
  assert.equal(validMeetingUrl("ftp://example.com/lesson"), false);
  assert.equal(validMeetingUrl("javascript:alert(1)"), false);
});

test("meeting URL preserves invalid-value rejection", () => {
  assert.equal(validMeetingUrl("not-a-url"), false);
  assert.equal(validMeetingUrl(""), false);
  assert.equal(validMeetingUrl(undefined), false);
});
