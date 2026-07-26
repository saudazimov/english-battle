const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createUploadedFileCleanup,
} = require("../src/utils/uploadedFileCleanup");

test("uploaded file cleanup preserves missing-file handling", () => {
  let calls = 0;
  const removeUploadedFile = createUploadedFileCleanup({
    fileSystem: {
      existsSync() { calls += 1; return true; },
      unlinkSync() { calls += 1; },
    },
  });

  assert.equal(removeUploadedFile(null), undefined);
  assert.equal(removeUploadedFile({}), undefined);
  assert.equal(calls, 0);
});

test("uploaded file cleanup preserves existence check and deletion", () => {
  const calls = [];
  const removeUploadedFile = createUploadedFileCleanup({
    fileSystem: {
      existsSync(filePath) { calls.push(["exists", filePath]); return true; },
      unlinkSync(filePath) { calls.push(["unlink", filePath]); },
    },
  });

  removeUploadedFile({ path: "C:/uploads/file.pdf" });

  assert.deepEqual(calls, [
    ["exists", "C:/uploads/file.pdf"],
    ["unlink", "C:/uploads/file.pdf"],
  ]);
});

test("uploaded file cleanup preserves missing-on-disk handling", () => {
  let unlinked = false;
  const removeUploadedFile = createUploadedFileCleanup({
    fileSystem: {
      existsSync() { return false; },
      unlinkSync() { unlinked = true; },
    },
  });

  removeUploadedFile({ path: "C:/uploads/missing.pdf" });
  assert.equal(unlinked, false);
});

test("uploaded file cleanup preserves filesystem error suppression", () => {
  const existsErrorCleanup = createUploadedFileCleanup({
    fileSystem: {
      existsSync() { throw new Error("exists failed"); },
      unlinkSync() {},
    },
  });
  const unlinkErrorCleanup = createUploadedFileCleanup({
    fileSystem: {
      existsSync() { return true; },
      unlinkSync() { throw new Error("unlink failed"); },
    },
  });

  assert.doesNotThrow(() => existsErrorCleanup({ path: "file.pdf" }));
  assert.doesNotThrow(() => unlinkErrorCleanup({ path: "file.pdf" }));
});
