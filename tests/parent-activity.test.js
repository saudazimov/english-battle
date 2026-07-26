const test = require("node:test");
const assert = require("node:assert/strict");
const { activityLabel } = require("../src/utils/parentActivity");

const DAY_MS = 86400000;

function withCurrentTime(now, callback) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    callback();
  } finally {
    Date.now = originalNow;
  }
}

test("parent activity preserves missing-value label", () => {
  assert.equal(activityLabel(null), "Hali faollik yo'q");
  assert.equal(activityLabel(""), "Hali faollik yo'q");
});

test("parent activity preserves day-range labels", () => {
  const now = Date.UTC(2026, 6, 26, 12);
  withCurrentTime(now, () => {
    assert.equal(activityLabel(new Date(now)), "Bugun");
    assert.equal(activityLabel(new Date(now - DAY_MS)), "Kecha");
    assert.equal(activityLabel(new Date(now - 7 * DAY_MS)), "Shu hafta");
    assert.equal(activityLabel(new Date(now - 30 * DAY_MS)), "Shu oy");
    assert.equal(activityLabel(new Date(now - 31 * DAY_MS)), "30 kundan oldin");
  });
});

test("parent activity preserves future and invalid timestamp behavior", () => {
  const now = Date.UTC(2026, 6, 26, 12);
  withCurrentTime(now, () => {
    assert.equal(activityLabel(new Date(now + DAY_MS)), "Bugun");
    assert.equal(activityLabel("invalid timestamp"), "30 kundan oldin");
  });
});
