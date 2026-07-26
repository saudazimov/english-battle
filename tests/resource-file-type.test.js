const test = require("node:test");
const assert = require("node:assert/strict");
const { detectFileType } = require("../src/utils/resourceFileType");

test("resource file type preserves document mappings", () => {
  assert.equal(detectFileType("application/pdf"), "pdf");
  assert.equal(detectFileType("application/msword"), "doc");
  assert.equal(
    detectFileType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "doc"
  );
});

test("resource file type preserves presentation and spreadsheet mappings", () => {
  assert.equal(detectFileType("application/vnd.ms-powerpoint"), "ppt");
  assert.equal(
    detectFileType("application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    "ppt"
  );
  assert.equal(detectFileType("application/vnd.ms-excel"), "xls");
  assert.equal(
    detectFileType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "xls"
  );
});

test("resource file type preserves image and fallback mappings", () => {
  assert.equal(detectFileType("image/png"), "image");
  assert.equal(detectFileType("text/plain"), "other");
  assert.equal(detectFileType("application/octet-stream"), "other");
});

test("resource file type preserves missing mimetype error", () => {
  assert.throws(() => detectFileType(undefined), TypeError);
});
