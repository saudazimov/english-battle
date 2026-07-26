const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createUploadedContentMatcher,
} = require("../src/utils/uploadedContentMatcher");

function matcherFor(content) {
  const source = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const calls = [];
  const matcher = createUploadedContentMatcher({
    fileSystem: {
      openSync(filePath, mode) { calls.push(["open", filePath, mode]); return 7; },
      readSync(descriptor, target) {
        calls.push(["read", descriptor]);
        const bytesRead = Math.min(source.length, target.length);
        source.copy(target, 0, 0, bytesRead);
        return bytesRead;
      },
      closeSync(descriptor) { calls.push(["close", descriptor]); },
    },
  });
  return { matcher, calls };
}

test("uploaded content matcher preserves image signatures", () => {
  assert.equal(matcherFor(Buffer.from("ffd8ffe0", "hex")).matcher({ path: "file", mimetype: "image/jpeg" }), true);
  assert.equal(matcherFor(Buffer.from("89504e470d0a1a0a", "hex")).matcher({ path: "file", mimetype: "image/png" }), true);
  assert.equal(matcherFor("GIF87a-data").matcher({ path: "file", mimetype: "image/gif" }), true);
  assert.equal(matcherFor("GIF89a-data").matcher({ path: "file", mimetype: "image/gif" }), true);
  assert.equal(matcherFor("RIFFxxxxWEBPdata").matcher({ path: "file", mimetype: "image/webp" }), true);
});

test("uploaded content matcher preserves document signatures", () => {
  assert.equal(matcherFor("%PDF-1.7").matcher({ path: "file", mimetype: "application/pdf" }), true);
  assert.equal(matcherFor(Buffer.from("d0cf11e0a1b11ae1", "hex")).matcher({ path: "file", mimetype: "application/msword" }), true);
  assert.equal(matcherFor(Buffer.from("d0cf11e0a1b11ae1", "hex")).matcher({ path: "file", mimetype: "application/vnd.ms-powerpoint" }), true);
  assert.equal(matcherFor(Buffer.from("504b0304", "hex")).matcher({ path: "file", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), true);
});

test("uploaded content matcher preserves text and mismatch handling", () => {
  assert.equal(matcherFor("plain text").matcher({ path: "file", mimetype: "text/plain" }), true);
  assert.equal(matcherFor(Buffer.from([65, 0, 66])).matcher({ path: "file", mimetype: "text/plain" }), false);
  assert.equal(matcherFor("not a pdf").matcher({ path: "file", mimetype: "application/pdf" }), false);
  assert.equal(matcherFor("data").matcher({ path: "file", mimetype: "application/octet-stream" }), false);
});

test("uploaded content matcher preserves file read sequence", () => {
  const { matcher, calls } = matcherFor("%PDF-1.7");
  assert.equal(matcher({ path: "C:/uploads/file.pdf", mimetype: "application/pdf" }), true);
  assert.deepEqual(calls, [
    ["open", "C:/uploads/file.pdf", "r"],
    ["read", 7],
    ["close", 7],
  ]);
});

test("uploaded content matcher preserves missing-file and read-error fallback", () => {
  const matcher = createUploadedContentMatcher({
    fileSystem: {
      openSync() { throw new Error("open failed"); },
      readSync() { throw new Error("must not read"); },
      closeSync() {},
    },
  });
  assert.equal(matcher(null), false);
  assert.equal(matcher({}), false);
  assert.equal(matcher({ path: "missing", mimetype: "application/pdf" }), false);
});
