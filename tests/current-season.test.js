const test = require("node:test");
const assert = require("node:assert/strict");
const { currentSeason } = require("../src/utils/currentSeason");

function withCurrentDate(isoDate, callback) {
  const OriginalDate = global.Date;
  global.Date = class MockDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length ? args : [isoDate]));
    }
  };
  try {
    callback();
  } finally {
    global.Date = OriginalDate;
  }
}

test("current season preserves first and second quarter labels", () => {
  withCurrentDate("2026-01-15T12:00:00Z", () => {
    assert.equal(currentSeason(), "2026-S1");
  });
  withCurrentDate("2026-06-15T12:00:00Z", () => {
    assert.equal(currentSeason(), "2026-S2");
  });
});

test("current season preserves third and fourth quarter labels", () => {
  withCurrentDate("2026-08-15T12:00:00Z", () => {
    assert.equal(currentSeason(), "2026-S3");
  });
  withCurrentDate("2026-12-15T12:00:00Z", () => {
    assert.equal(currentSeason(), "2026-S4");
  });
});

test("current season preserves year rollover", () => {
  withCurrentDate("2027-01-01T00:00:00Z", () => {
    assert.equal(currentSeason(), "2027-S1");
  });
});
